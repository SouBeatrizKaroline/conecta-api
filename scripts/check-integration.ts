// Read-only imports of the sibling clients. Only an in-memory test database is changed.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from '../src/db/database.ts';
import { createApp } from '../src/app.ts';
import { seed } from './seed.ts';

const appPath = resolve(process.env.CONECTA_APP_PATH ?? '../conecta-app');
const analyticsPath = resolve(process.env.CONECTA_ANALYTICS_PATH ?? '../conecta-analytics');
const { ConectaClient } = await import(pathToFileURL(resolve(appPath, 'integration/client.js')));
const { Api } = await import(pathToFileURL(resolve(analyticsPath, 'src/api.js')));
const db = openDatabase(':memory:');
seed(db);
const token = 'integration-test-only-not-a-production-secret';
const server = createApp(db, { readOnly: false, adminToken: token }).listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const app = new ConectaClient(url),
    analytics = new Api(url, token);
  assert.equal((await analytics.json('/health')).capabilities.historicalSignals, true);
  const before = await analytics.json('/api/v1/admin/summary');
  await app.start('demo-01', true);
  await app.track('page_view', 'home', 'page');
  await app.track('click', 'ajuda', 'ajuda');
  await app.track('click', 'ajuda', 'ajuda');
  assert.equal((await app.context()).recommendation.rule, 'repeated-help');
  assert.equal((await analytics.json('/api/v1/admin/summary')).events, before.events + 3);
  const signals = await analytics.json('/api/v2/admin/signals');
  const signal = signals.items.find((s) => s.id === 'demo-01:repeated-help');
  assert.equal(signal.activeNow, true);
  await analytics.json(`/api/v1/admin/signals/${encodeURIComponent(signal.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'planned' }),
  });
  assert.equal((await analytics.json('/api/v1/admin/audit')).items[0].status, 'planned');
  assert.match(await (await analytics.get('/api/v1/admin/events.csv')).text(), /ajuda/);
  await app.revoke();
  assert.equal((await analytics.json('/api/v1/admin/summary')).events, before.events);
  console.log(
    'PASS: App original → API → Analytics; contexto, sinais v2, ação, auditoria, CSV e retirada da coleta.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}
