import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/database.ts';
import { createApp } from '../src/app.ts';
import { seed } from '../scripts/seed.ts';
import { csv } from '../src/services/analytics.ts';
import { historicalSignals } from '../src/services/insights.ts';
const token = 'test-only-token-with-more-than-thirty-two-characters';

test('contexto explica preferência, ajuda e conclusão sem cruzar sessões', async (t) => {
  const { call, session } = await fixture(t);
  const a = await session(),
    b = await session();
  const context = async (s) =>
    (await call(`/api/v1/sessions/${s.id}/context`, { auth: s.token })).data;
  const track = async (type, target) => {
    const r = await call(`/api/v1/sessions/${a.id}/events`, {
      method: 'POST',
      auth: a.token,
      body: {
        id: randomUUID(),
        type,
        target,
        page: 'oportunidades',
        occurredAt: new Date().toISOString(),
      },
    });
    assert.equal(r.status, 201);
  };
  assert.equal((await context(a)).recommendation.rule, 'welcome');
  await track('click', 'explorar');
  assert.equal((await context(a)).recommendation.rule, 'exploring');
  await track('preference', 'energia');
  assert.equal((await context(a)).recommendation.target, 'energia');
  assert.equal((await context(b)).recommendation.rule, 'welcome');
  assert.equal((await call(`/api/v1/sessions/${a.id}/context`, { auth: b.token })).status, 401);
  await track('click', 'ajuda');
  await track('click', 'ajuda');
  assert.equal((await context(a)).recommendation.rule, 'repeated-help');
  await track('journey_completed', 'concluir');
  assert.equal((await context(a)).recommendation.rule, 'completed');
  await call(`/api/v1/sessions/${a.id}/preferences`, {
    method: 'PATCH',
    auth: a.token,
    body: { analyticsConsent: false },
  });
  assert.equal((await context(a)).recommendation.rule, 'collection-disabled');
  await call(`/api/v1/sessions/${a.id}/preferences`, {
    method: 'PATCH',
    auth: a.token,
    body: { analyticsConsent: true },
  });
  assert.equal((await context(a)).recommendation.rule, 'welcome');
});

test('sinais v2 usam referência histórica e distinguem retorno posterior', async (t) => {
  const { db, call, session } = await fixture(t);
  const s = await session();
  const insert = (id, type, target, time) =>
    db
      .prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, s.id, type, 'oportunidades', target, time, time);
  insert('past', 'click', 'explorar', '2026-01-01T12:00:00.000Z');
  insert('return', 'journey_completed', 'concluir', '2026-01-20T12:00:00.000Z');
  const filter = { from: '2026-01-01', to: '2026-01-10', segment: null, limit: 50, offset: 0 };
  const report = historicalSignals(db, filter, Date.parse('2026-02-01T00:00:00.000Z'));
  assert.equal(report.evaluatedAt, '2026-01-10T23:59:59.999Z');
  assert.equal(report.items[0].rule, 'inactive-7d');
  assert.equal(report.items[0].activeNow, false);
  assert.equal(report.items[0].statusScope, 'current');
  const recent = historicalSignals(db, { ...filter, to: '2026-01-02' }, Date.parse('2026-02-01'));
  assert.equal(
    recent.total,
    0,
    'relógio de hoje não deve criar inatividade em um recorte de um dia',
  );
  assert.equal((await call('/api/v2/admin/signals')).status, 401);
  assert.equal(
    (await call('/api/v2/admin/signals?from=2026-01-01&to=2026-01-10', { auth: token })).status,
    200,
  );
  assert.equal((await call('/api/v2/admin/signals?limit=0', { auth: token })).status, 400);
});

test('sinais v2 incluem conclusão anterior ao recorte e paginam depois de calcular', async (t) => {
  const { db, session } = await fixture(t);
  const s = await session();
  for (const [id, type, target, time] of [
    ['complete', 'journey_completed', 'concluir', '2026-01-01T00:00:00.000Z'],
    ['help1', 'click', 'ajuda', '2026-01-10T00:00:00.000Z'],
    ['help2', 'click', 'ajuda', '2026-01-11T00:00:00.000Z'],
  ])
    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      s.id,
      type,
      'ajuda',
      target,
      time,
      time,
    );
  const filter = { from: '2026-01-10', to: '2026-01-30', segment: null, limit: 1, offset: 0 };
  const report = historicalSignals(db, filter, Date.parse('2026-02-01'));
  assert.deepEqual(
    report.items.map((s) => s.rule),
    ['repeated-help'],
  );
  const page2 = historicalSignals(db, { ...filter, offset: 1 }, Date.parse('2026-02-01'));
  assert.equal(page2.total, 1);
  assert.equal(page2.items.length, 0);
  assert.equal(
    historicalSignals(db, { ...filter, from: '2026-01-12' }, Date.parse('2026-02-01')).total,
    0,
  );
});

test('sinais v2 limitam referência ao presente e permitem leitura pública fictícia', async (t) => {
  const { db, call } = await fixture(t, { readOnly: true });
  const now = Date.parse('2026-01-02T12:00:00.000Z');
  const report = historicalSignals(
    db,
    { from: '2026-01-01', to: '2026-01-30', segment: null, limit: 50, offset: 0 },
    now,
  );
  assert.equal(report.evaluatedAt, new Date(now).toISOString());
  assert.equal(report.total, 0);
  assert.equal((await call('/api/v2/admin/signals')).status, 200);
});
async function fixture(t, options = {}) {
  const db = openDatabase(':memory:');
  const server = createApp(db, {
    readOnly: false,
    adminToken: token,
    origins: ['http://localhost:8080'],
    ...options,
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const call = async (path, { body, auth, method = 'GET', headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      headers: response.headers,
      data: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text(),
    };
  };
  const session = async () =>
    (
      await call('/api/v1/sessions', {
        method: 'POST',
        body: { profileId: 'demo-01', analyticsConsent: true },
      })
    ).data;
  return { db, call, session };
}
test('jornada integrada: coleta, idempotência, contexto mínimo, analytics e CSV', async (t) => {
  const { call, session } = await fixture(t);
  const s = await session();
  const event = {
    id: randomUUID(),
    type: 'click',
    page: 'oportunidades',
    target: 'explorar',
    occurredAt: new Date().toISOString(),
  };
  const path = `/api/v1/sessions/${s.id}/events`;
  assert.equal((await call(path, { method: 'POST', auth: s.token, body: event })).status, 201);
  const duplicate = await call(path, { method: 'POST', auth: s.token, body: event });
  assert.equal(duplicate.data.duplicate, true);
  assert.equal(
    (await call(path, { method: 'POST', auth: s.token, body: { ...event, target: 'ajuda' } }))
      .status,
    409,
  );
  const summary = await call('/api/v1/admin/summary', { auth: token });
  assert.equal(summary.data.events, 1);
  assert.equal(summary.data.sessions, 1);
  assert.deepEqual(summary.data.firstClicks, [{ label: 'explorar', value: 1 }]);
  const context = await call(`/api/v1/sessions/${s.id}/context`, { auth: s.token });
  assert.equal(context.data.profileId, 'demo-01');
  assert.equal('token' in context.data, false);
  const report = await call('/api/v1/admin/events.csv', { auth: token });
  assert.match(report.data, /explorar/);
  assert.doesNotMatch(report.data, /token|email|cnpj/i);
});
test('autorização administrativa e isolamento de sessões', async (t) => {
  const { call, session } = await fixture(t);
  const a = await session(),
    b = await session();
  assert.equal((await call('/api/v1/admin/summary')).status, 401);
  assert.equal((await call('/api/v1/admin/summary', { auth: a.token })).status, 401);
  assert.equal((await call(`/api/v1/sessions/${a.id}/context`, { auth: b.token })).status, 401);
  assert.equal((await call('/.env')).status, 404);
  assert.equal((await call('/src/app.js')).status, 404);
});
test('retirada da coleta remove eventos e impede novas capturas', async (t) => {
  const { call, session } = await fixture(t);
  const s = await session();
  const event = {
    id: randomUUID(),
    type: 'page_view',
    page: 'home',
    target: 'page',
    occurredAt: new Date().toISOString(),
  };
  await call(`/api/v1/sessions/${s.id}/events`, { method: 'POST', auth: s.token, body: event });
  assert.equal(
    (
      await call(`/api/v1/sessions/${s.id}/preferences`, {
        method: 'PATCH',
        auth: s.token,
        body: { analyticsConsent: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/v1/sessions/${s.id}/events`, {
        method: 'POST',
        auth: s.token,
        body: { ...event, id: randomUUID() },
      })
    ).status,
    403,
  );
  assert.equal((await call('/api/v1/admin/summary', { auth: token })).data.events, 0);
});
test('contrato rejeita dados pessoais, filtros injetados, datas inválidas e payload grande', async (t) => {
  const { call, session } = await fixture(t);
  const s = await session();
  assert.equal(
    (
      await call('/api/v1/sessions', {
        method: 'POST',
        body: { profileId: 'demo-01', analyticsConsent: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/v1/sessions/${s.id}/events`, {
        method: 'POST',
        auth: s.token,
        body: { email: 'nao-coletar@example.invalid' },
      })
    ).status,
    400,
  );
  for (const query of [
    'from=2026-02-30',
    'segment=energia%27%20OR%201=1',
    'limit=-1',
    'from=2026-09-20&to=2026-09-01',
    'offset=abc',
  ])
    assert.equal((await call(`/api/v1/admin/summary?${query}`, { auth: token })).status, 400);
  assert.equal(
    (await call('/api/v1/sessions', { method: 'POST', body: { payload: 'x'.repeat(17000) } }))
      .status,
    413,
  );
});
test('CORS explícito e limites de requisições', async (t) => {
  const { call } = await fixture(t, { rateLimit: 3 });
  assert.equal(
    (await call('/health', { headers: { Origin: 'https://nao-autorizado.example' } })).status,
    403,
  );
  const accepted = await call('/health', { headers: { Origin: 'http://localhost:8080' } });
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  await call('/health');
  await call('/health');
  assert.equal((await call('/health')).status, 429);
});
test('base simulada, filtros, regras e gestão persistente com auditoria', async (t) => {
  const { call, db } = await fixture(t);
  assert.equal(seed(db), true);
  assert.equal(seed(db), false);
  const summary = (await call('/api/v1/admin/summary', { auth: token })).data;
  assert.equal(summary.events, 37);
  assert.equal(summary.profiles, 6);
  assert.equal(summary.returningProfiles, 3);
  assert.equal(summary.completedProfiles, 1);
  assert.equal(
    (await call('/api/v1/admin/journeys?segment=tecnologia', { auth: token })).data.total,
    2,
  );
  const items = (await call('/api/v1/admin/signals', { auth: token })).data.items;
  const inactive = items.find((item) => item.id === 'demo-02:inactive-7d');
  assert.ok(inactive);
  const update = await call(`/api/v1/admin/signals/${inactive.id}`, {
    method: 'PATCH',
    auth: token,
    body: { status: 'planned' },
  });
  assert.equal(update.status, 200);
  assert.equal(
    (await call('/api/v1/admin/signals', { auth: token })).data.items.find(
      (item) => item.id === inactive.id,
    ).status,
    'planned',
  );
  assert.equal(
    (await call('/api/v1/admin/audit', { auth: token })).data.items[0].previous_status,
    'open',
  );
  assert.equal(
    (await call('/api/v1/admin/journeys?limit=1&offset=1', { auth: token })).data.items.length,
    1,
  );
});
test('modo público permite captura consentida e proíbe mutações administrativas', async (t) => {
  const { call, db } = await fixture(t, { readOnly: true });
  seed(db);
  assert.deepEqual((await call('/health')).data.capabilities, {
    historicalSignals: true,
    sessionRecommendations: true,
    users: true,
    campaigns: true,
    responseEnvelope: true,
    sessionCapture: true,
  });
  assert.equal((await call('/api/v1/admin/summary')).status, 200);
  assert.equal(
    (
      await call('/api/v1/sessions', {
        method: 'POST',
        body: { profileId: 'demo-01', analyticsConsent: true },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call('/api/v1/admin/signals/demo-02:inactive-7d', {
        method: 'PATCH',
        auth: token,
        body: { status: 'done' },
      })
    ).status,
    403,
  );
});
test('SQLite conserva eventos ao reabrir e CSV neutraliza fórmulas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conecta-test-'));
  try {
    let db = openDatabase(join(dir, 'db.sqlite'));
    seed(db);
    db.close();
    db = openDatabase(join(dir, 'db.sqlite'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get().n, 37);
    db.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
  assert.match(csv([{ id: '=HYPERLINK("x")' }]), /'=HYPERLINK/);
});
