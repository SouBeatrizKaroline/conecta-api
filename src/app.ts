import express, { type NextFunction, type Request, type Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  ApiError,
  filters,
  object,
  requireValue,
  statuses,
  validateCampaign,
  validateCampaignPatch,
  validateEvent,
  validateLogin,
  validateUser,
} from './validation.ts';
import { campaignStatuses, segments, type CampaignStatus, type Principal, type Segment, type SessionRow, type UserRow } from './types.ts';
import { csv, journeys, selectEvents, signals, summary } from './services/analytics.ts';
import { sessionContext } from './services/context.ts';
import { historicalSignals } from './services/insights.ts';
import { createUser, login, logout, resolvePrincipal, tokenHash } from './services/auth.ts';
import { campaignStatusCounts, createCampaign, getCampaign, listCampaigns, updateCampaign } from './services/campaigns.ts';

interface Logger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

interface AppOptions {
  readOnly?: boolean;
  adminToken?: string;
  origins?: string[];
  rateLimit?: number;
  logger?: Logger;
}

const defaultLogger: Logger = {
  info: (entry) => console.log(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry)),
};

function bearer(req: Request): string {
  return (req.get('authorization') ?? '').replace(/^Bearer /, '');
}

function ok(res: Response, data: unknown, message = '', status = 200) {
  const compatibility = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return res.status(status).json({ success: true, message, data, ...compatibility });
}

function queryRecord(req: Request): Record<string, unknown> {
  return req.query as Record<string, unknown>;
}

export function createApp(db: DatabaseSync, options: AppOptions = {}) {
  const {
    readOnly = true,
    adminToken = '',
    origins = [],
    rateLimit = 300,
    logger = defaultLogger,
  } = options;
  const allowedOrigins = new Set([...origins, 'https://soubeatrizkaroline.github.io']);
  if (!readOnly && adminToken.length < 32)
    throw new Error('ADMIN_TOKEN precisa de pelo menos 32 caracteres. Execute npm run setup.');

  const app = express();
  app.disable('x-powered-by');
  const requests = new Map<string, { count: number; until: number }>();

  app.use((req, res, next) => {
    const startedAt = Date.now();
    req.requestId = randomUUID();
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Request-Id': req.requestId,
    });
    res.on('finish', () =>
      logger.info({
        level: 'info',
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      }),
    );
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin))
      return next(new ApiError(403, 'ORIGIN_DENIED', 'Origem não autorizada.'));
    if (origin)
      res.set({
        'Access-Control-Allow-Origin': origin,
        Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      });
    const now = Date.now();
    for (const [key, value] of requests) if (now > value.until) requests.delete(key);
    const key = req.ip ?? 'unknown';
    const bucket = requests.get(key) ?? { count: 0, until: now + 60_000 };
    bucket.count++;
    requests.set(key, bucket);
    if (bucket.count > rateLimit) {
      res.set('Retry-After', '60');
      return next(new ApiError(429, 'RATE_LIMIT', 'Aguarde um minuto antes de tentar novamente.'));
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  app.use(express.json({ limit: '16kb', strict: true }));

  const writable = (_req: Request, _res: Response, next: NextFunction) =>
    readOnly
      ? next(new ApiError(403, 'READ_ONLY', 'Demonstração pública somente para leitura.'))
      : next();

  const administrative = (req: Request, _res: Response, next: NextFunction) => {
    if (readOnly && req.method === 'GET') return next();
    const principal = resolvePrincipal(db, bearer(req), adminToken);
    if (!principal)
      return next(new ApiError(401, 'UNAUTHORIZED', 'Credencial administrativa inválida.'));
    req.principal = principal;
    return next();
  };

  const adminOnly = (req: Request, _res: Response, next: NextFunction) =>
    req.principal?.role === 'admin'
      ? next()
      : next(new ApiError(403, 'FORBIDDEN', 'Ação permitida somente para administradoras.'));

  const authenticatedUser = (req: Request, _res: Response, next: NextFunction) => {
    const principal = resolvePrincipal(db, bearer(req), adminToken);
    if (!principal || principal.source !== 'user-session')
      return next(new ApiError(401, 'UNAUTHORIZED', 'Sessão de usuária inválida ou expirada.'));
    req.principal = principal;
    return next();
  };

  const session = (req: Request<{ id: string }>, _res: Response, next: NextFunction) => {
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id) as
      | SessionRow
      | undefined;
    if (
      !row ||
      row.token_hash !== tokenHash(bearer(req)) ||
      row.expires_at < new Date().toISOString()
    )
      return next(new ApiError(401, 'INVALID_SESSION', 'Sessão inválida ou expirada.'));
    req.session = row;
    return next();
  };

  app.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    return ok(res, {
      status: 'ok',
      version: '0.2.0',
      simulated: true,
      readOnly,
      capabilities: {
        historicalSignals: true,
        sessionRecommendations: true,
        users: true,
        campaigns: true,
        responseEnvelope: true,
      },
    });
  });

  app.get('/api-docs/openapi.json', (_req, res) =>
    res.type('application/json').send(readFileSync(new URL('../docs/openapi.json', import.meta.url))),
  );
  app.get('/api-docs', (_req, res) =>
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Conecta API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api-docs/openapi.json',dom_id:'#swagger-ui'});</script></body></html>`),
  );

  app.get('/api/v1/catalog', (_req, res) =>
    ok(res, {
      simulated: true,
      profiles: db.prepare('SELECT id,label,segment FROM profiles ORDER BY id').all(),
      interests: [...segments],
      readOnly,
    }),
  );

  app.post('/api/v1/auth/login', writable, (req, res) => {
    const credentials = validateLogin(req.body);
    const authenticated = login(db, credentials.email, credentials.password);
    if (!authenticated) throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    return ok(res, authenticated, 'Autenticação realizada.');
  });

  app.get('/api/v1/auth/me', authenticatedUser, (req, res) => {
    const user = db.prepare('SELECT id,name,email,role,created_at AS createdAt FROM users WHERE id=?').get(req.principal!.id);
    return ok(res, user);
  });

  app.post('/api/v1/auth/logout', writable, authenticatedUser, (req, res) => {
    logout(db, bearer(req));
    return ok(res, { loggedOut: true }, 'Sessão encerrada.');
  });

  app.post('/api/v1/sessions', writable, (req, res) => {
    object(req.body, ['profileId', 'analyticsConsent']);
    requireValue(
      typeof req.body.profileId === 'string' &&
        db.prepare('SELECT id FROM profiles WHERE id=?').get(req.body.profileId),
      'Selecione um perfil fictício do catálogo.',
    );
    requireValue(req.body.analyticsConsent === true, 'A coleta demonstrativa exige adesão explícita.');
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, 1, ?, ?)').run(
      id,
      req.body.profileId,
      tokenHash(token),
      now,
      expiresAt,
    );
    return ok(res, { id, token, expiresIn: 86_400, simulated: true }, 'Sessão criada.', 201);
  });

  app.get('/api/v1/sessions/:id/context', session, (req, res) => {
    const current = req.session!;
    const context = sessionContext(
      current.consent
        ? (db
            .prepare('SELECT type,target FROM events WHERE session_id=? ORDER BY occurred_at,id')
            .all(req.params.id) as Array<{ type: string; target: string }>)
        : [],
      Boolean(current.consent),
    );
    return ok(res, {
      profileId: current.profile_id,
      analyticsConsent: Boolean(current.consent),
      simulated: true,
      ...context,
    });
  });

  app.patch('/api/v1/sessions/:id/preferences', writable, session, (req, res) => {
    object(req.body, ['analyticsConsent']);
    requireValue(typeof req.body.analyticsConsent === 'boolean', 'analyticsConsent deve ser booleano.');
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE sessions SET consent=? WHERE id=?').run(Number(req.body.analyticsConsent), req.params.id);
      if (!req.body.analyticsConsent) db.prepare('DELETE FROM events WHERE session_id=?').run(req.params.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return ok(res, { analyticsConsent: req.body.analyticsConsent, eventsRemoved: !req.body.analyticsConsent }, 'Preferência atualizada.');
  });

  app.post('/api/v1/sessions/:id/events', writable, session, (req, res) => {
    if (!req.session!.consent)
      throw new ApiError(403, 'CONSENT_REQUIRED', 'Coleta desativada nesta sessão.');
    const event = validateEvent(req.body);
    const previous = db.prepare('SELECT * FROM events WHERE id=?').get(event.id) as
      | { session_id: string; type: string; page: string; target: string; occurred_at: string }
      | undefined;
    if (previous) {
      if (
        previous.session_id !== req.params.id ||
        previous.type !== event.type ||
        previous.page !== event.page ||
        previous.target !== event.target ||
        previous.occurred_at !== event.occurredAt
      )
        throw new ApiError(409, 'ID_CONFLICT', 'id já utilizado com outro conteúdo.');
      return ok(res, { accepted: true, duplicate: true, id: event.id }, 'Evento já recebido.');
    }
    db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      event.id,
      req.params.id,
      event.type,
      event.page,
      event.target,
      event.occurredAt,
      new Date().toISOString(),
    );
    return ok(res, { accepted: true, duplicate: false, id: event.id }, 'Evento aceito.', 201);
  });

  app.use('/api/v1/admin', administrative);
  app.use('/api/v2/admin', administrative);

  const reportData = (req: Request) => {
    const filter = filters(queryRecord(req));
    return { filter, events: selectEvents(db, filter) };
  };

  app.get('/api/v2/admin/signals', (req, res) =>
    ok(res, historicalSignals(db, filters(queryRecord(req)))),
  );

  app.get('/api/v1/admin/summary', (req, res) => {
    const { filter, events } = reportData(req);
    return ok(res, { simulated: true, filter, ...summary(events) });
  });

  app.get('/api/v1/admin/dashboard', (req, res) => {
    const { filter, events } = reportData(req);
    const insights = historicalSignals(db, filter);
    return ok(res, {
      simulated: true,
      filter,
      metrics: summary(events),
      recommendations: insights.total,
      campaignStatus: campaignStatusCounts(db),
    });
  });

  app.get('/api/v1/admin/journeys', (req, res) => {
    const { filter, events } = reportData(req);
    const items = journeys(events);
    return ok(res, {
      simulated: true,
      total: items.length,
      items: items.slice(filter.offset, filter.offset + filter.limit),
      pagination: { limit: filter.limit, offset: filter.offset },
    });
  });

  app.get('/api/v1/admin/signals', (req, res) => {
    const { filter, events } = reportData(req);
    const items = signals(db, events);
    return ok(res, {
      simulated: true,
      total: items.length,
      items: items.slice(filter.offset, filter.offset + filter.limit),
    });
  });

  app.get('/api/v1/admin/recommendations', (req, res) => {
    const report = historicalSignals(db, filters(queryRecord(req)));
    return ok(res, {
      simulated: true,
      total: report.total,
      items: report.items.map((signal) => ({
        id: signal.id,
        profileId: signal.profileId,
        segment: signal.segment,
        title: signal.title,
        reason: signal.reason,
        recommendation: signal.recommendation,
        priority: signal.priority,
        activeNow: signal.activeNow,
      })),
    });
  });

  app.patch('/api/v1/admin/signals/:id', writable, (req, res) => {
    object(req.body, ['status']);
    requireValue(typeof req.body.status === 'string' && statuses.includes(req.body.status as (typeof statuses)[number]), 'Status inválido.');
    const signalId = String(req.params.id ?? '');
    const parts = signalId.split(':');
    requireValue(
      parts.length === 2 &&
        ['inactive-7d', 'repeated-help', 'opportunity-interest'].includes(parts[1] ?? '') &&
        db.prepare('SELECT id FROM profiles WHERE id=?').get(parts[0] ?? ''),
      'Sinal inválido.',
    );
    const all = selectEvents(db, { from: '0001-01-01', to: '9999-12-31', segment: null, limit: 200, offset: 0, sort: 'occurredAt', order: 'asc' });
    requireValue(signals(db, all).some((item) => item.id === signalId), 'Sinal não está ativo na base completa.');
    const previous = (db.prepare('SELECT status FROM actions WHERE signal_id=?').get(signalId) as { status: string } | undefined)?.status ?? 'open';
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO actions VALUES (?, ?, ?) ON CONFLICT(signal_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').run(signalId, req.body.status, now);
      db.prepare('INSERT INTO audit (signal_id,previous_status,status,created_at,actor_id) VALUES (?, ?, ?, ?, ?)').run(signalId, previous, req.body.status, now, req.principal?.id ?? null);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return ok(res, { id: signalId, status: req.body.status, simulated: true }, 'Estado da ação atualizado.');
  });

  app.get('/api/v1/admin/audit', (req, res) => {
    object(req.query, ['limit', 'offset']);
    const filter = filters(queryRecord(req));
    const items = db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ? OFFSET ?').all(filter.limit, filter.offset);
    return ok(res, { items, pagination: { limit: filter.limit, offset: filter.offset } });
  });

  app.get('/api/v1/admin/users', adminOnly, (req, res) => {
    object(req.query, ['limit', 'offset']);
    const filter = filters(queryRecord(req));
    const total = (db.prepare('SELECT count(*) AS total FROM users').get() as { total: number }).total;
    const items = db.prepare('SELECT id,name,email,role,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(filter.limit, filter.offset);
    return ok(res, { total, items, pagination: { limit: filter.limit, offset: filter.offset } });
  });

  app.post('/api/v1/admin/users', writable, adminOnly, (req, res) => {
    const input = validateUser(req.body);
    if (db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
      throw new ApiError(409, 'EMAIL_EXISTS', 'Já existe uma usuária com este e-mail.');
    return ok(res, createUser(db, input), 'Usuária criada.', 201);
  });

  app.get('/api/v1/admin/campaigns', (req, res) => {
    object(req.query, ['segment', 'status', 'limit', 'offset', 'order']);
    const segment = typeof req.query.segment === 'string' ? req.query.segment : null;
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    requireValue(segment === null || segments.includes(segment as Segment), 'Segmento inválido.');
    requireValue(status === null || campaignStatuses.includes(status as CampaignStatus), 'Status inválido.');
    const pagination = filters({ limit: req.query.limit, offset: req.query.offset });
    return ok(res, {
      ...listCampaigns(db, {
        segment: segment as Segment | null,
        status: status as CampaignStatus | null,
        limit: pagination.limit,
        offset: pagination.offset,
        order,
      }),
      pagination: { limit: pagination.limit, offset: pagination.offset },
    });
  });

  app.post('/api/v1/admin/campaigns', writable, (req, res) => {
    const principal: Principal = req.principal!;
    return ok(res, createCampaign(db, validateCampaign(req.body), principal), 'Campanha criada como rascunho.', 201);
  });

  app.get('/api/v1/admin/campaigns/:id', (req, res) => {
    const id = String(req.params.id ?? '');
    const campaign = getCampaign(db, id);
    if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campanha não encontrada.');
    return ok(res, campaign);
  });

  app.patch('/api/v1/admin/campaigns/:id', writable, (req, res) => {
    const id = String(req.params.id ?? '');
    const campaign = getCampaign(db, id);
    if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campanha não encontrada.');
    const patch = validateCampaignPatch(req.body);
    return ok(res, updateCampaign(db, id, campaign, patch), 'Campanha atualizada.');
  });

  const sendCsv = (req: Request, res: Response) => {
    const { events } = reportData(req);
    if (events.length > 10_000)
      throw new ApiError(400, 'EXPORT_LIMIT', 'Reduza o período para até 10.000 eventos.');
    return res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="conecta-eventos-simulados.csv"',
      })
      .send(csv(events));
  };
  app.get('/api/v1/admin/events.csv', sendCsv);
  app.get('/api/v1/admin/reports/events.csv', sendCsv);

  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Recurso não encontrado.')));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const payload = error as { status?: number; code?: string; message?: string; details?: string[] };
    const status =
      payload.status === 413
        ? 413
        : error instanceof SyntaxError && payload.status === 400
          ? 400
          : (payload.status ?? 500);
    const code = payload.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST');
    const message = status === 500 ? 'Erro interno. Consulte o responsável pela API.' : (payload.message ?? 'Requisição inválida.');
    if (status >= 500) logger.error({ level: 'error', requestId: req.requestId, code, message: payload.message });
    return res.status(status).json({
      success: false,
      message,
      errors: payload.details?.length ? payload.details : [message],
      error: { code, message, requestId: req.requestId },
    });
  });

  return app;
}
