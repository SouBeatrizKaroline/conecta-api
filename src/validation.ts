import {
  actionStatuses,
  campaignChannels,
  campaignStatuses,
  eventPages,
  eventTargets,
  eventTypes,
  segments,
  type AnalyticsFilter,
  type CampaignInput,
  type EventInput,
  type Segment,
  type UserRole,
} from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ApiError(400, 'INVALID_INPUT', message, [message]);
}

export function object(body: unknown, keys: readonly string[]): asserts body is Record<string, unknown> {
  requireValue(body && typeof body === 'object' && !Array.isArray(body), 'Envie um objeto JSON.');
  requireValue(
    Object.keys(body).every((key) => keys.includes(key)),
    'Campo não permitido. Envie somente o contrato documentado.',
  );
}

export const statuses = actionStatuses;

export function validateEvent(body: unknown): EventInput {
  object(body, ['id', 'type', 'page', 'target', 'occurredAt']);
  requireValue(
    typeof body.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id),
    'id deve ser UUID v4.',
  );
  requireValue(
    typeof body.type === 'string' && eventTypes.includes(body.type as EventInput['type']),
    'Tipo fora do catálogo.',
  );
  requireValue(
    typeof body.page === 'string' && eventPages.includes(body.page as EventInput['page']),
    'Página fora do catálogo.',
  );
  requireValue(
    typeof body.target === 'string' && eventTargets.includes(body.target as EventInput['target']),
    'Alvo fora do catálogo.',
  );
  const time = typeof body.occurredAt === 'string' ? Date.parse(body.occurredAt) : Number.NaN;
  requireValue(
    Number.isFinite(time) && time <= Date.now() + 60_000 && time >= Date.now() - 86_400_000,
    'occurredAt deve estar nas últimas 24 horas (tolerância futura: 60 segundos).',
  );
  return {
    id: body.id,
    type: body.type as EventInput['type'],
    page: body.page as EventInput['page'],
    target: body.target as EventInput['target'],
    occurredAt: new Date(time).toISOString(),
  };
}

function single(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  requireValue(typeof value === 'string', 'Parâmetro repetido ou inválido.');
  return value;
}

export function filters(query: Record<string, unknown>): AnalyticsFilter {
  object(query, ['from', 'to', 'segment', 'limit', 'offset', 'sort', 'order']);
  const day = (value: unknown, fallback: string): string => {
    const item = single(value);
    if (item === undefined) return fallback;
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(item), 'Use datas YYYY-MM-DD.');
    requireValue(
      Number.isFinite(Date.parse(item)) && new Date(item).toISOString().slice(0, 10) === item,
      'Data inválida.',
    );
    return item;
  };
  const from = day(query.from, new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const to = day(query.to, new Date().toISOString().slice(0, 10));
  requireValue(
    from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86_400_000,
    'Intervalo deve ter até 366 dias e início anterior ao fim.',
  );
  const segment = single(query.segment);
  requireValue(segment === undefined || segments.includes(segment as Segment), 'Segmento inválido.');
  const number = (value: unknown, fallback: number, max: number): number => {
    const item = single(value);
    if (item === undefined) return fallback;
    requireValue(/^\d+$/.test(item) && Number(item) <= max, 'Paginação inválida.');
    return Number(item);
  };
  const limit = number(query.limit, 50, 200);
  requireValue(limit > 0, 'limit deve ser positivo.');
  const sort = single(query.sort) ?? 'occurredAt';
  const order = single(query.order) ?? 'asc';
  requireValue(['occurredAt', 'profileId'].includes(sort), 'Ordenação inválida.');
  requireValue(['asc', 'desc'].includes(order), 'Direção de ordenação inválida.');
  return {
    from,
    to,
    segment: (segment as Segment | undefined) ?? null,
    limit,
    offset: number(query.offset, 0, 1_000_000),
    sort: sort as AnalyticsFilter['sort'],
    order: order as AnalyticsFilter['order'],
  };
}

export function validateUser(body: unknown) {
  object(body, ['name', 'email', 'password', 'role']);
  requireValue(typeof body.name === 'string' && body.name.trim().length >= 3 && body.name.length <= 80, 'Nome deve ter entre 3 e 80 caracteres.');
  requireValue(typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.email.length <= 160, 'E-mail inválido.');
  requireValue(typeof body.password === 'string' && body.password.length >= 10 && body.password.length <= 128, 'Senha deve ter entre 10 e 128 caracteres.');
  requireValue(body.role === 'admin' || body.role === 'analyst', 'Perfil de acesso inválido.');
  return { name: body.name.trim(), email: body.email.trim().toLowerCase(), password: body.password, role: body.role as UserRole };
}

export function validateLogin(body: unknown) {
  object(body, ['email', 'password']);
  requireValue(typeof body.email === 'string' && typeof body.password === 'string', 'E-mail e senha são obrigatórios.');
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

export function validateCampaign(body: unknown): CampaignInput {
  object(body, ['name', 'segment', 'channel', 'message', 'signalIds']);
  requireValue(typeof body.name === 'string' && body.name.trim().length >= 3 && body.name.length <= 100, 'Nome da campanha deve ter entre 3 e 100 caracteres.');
  requireValue(typeof body.segment === 'string' && segments.includes(body.segment as Segment), 'Segmento inválido.');
  requireValue(typeof body.channel === 'string' && campaignChannels.includes(body.channel as CampaignInput['channel']), 'Canal inválido.');
  requireValue(typeof body.message === 'string' && body.message.trim().length >= 1 && body.message.length <= 500, 'Mensagem deve ter entre 1 e 500 caracteres.');
  requireValue(Array.isArray(body.signalIds) && body.signalIds.length <= 20 && body.signalIds.every((id) => typeof id === 'string' && /^[a-z0-9-]+:[a-z0-9-]+$/.test(id)), 'signalIds inválido.');
  return { name: body.name.trim(), segment: body.segment as Segment, channel: body.channel as CampaignInput['channel'], message: body.message.trim(), signalIds: [...new Set(body.signalIds as string[])] };
}

export function validateCampaignPatch(body: unknown) {
  object(body, ['name', 'segment', 'channel', 'message', 'signalIds', 'status']);
  requireValue(Object.keys(body).length > 0, 'Envie ao menos uma alteração.');
  if (body.status !== undefined) requireValue(typeof body.status === 'string' && campaignStatuses.includes(body.status as (typeof campaignStatuses)[number]), 'Status de campanha inválido.');
  const base = {
    name: body.name ?? 'Campanha temporária',
    segment: body.segment ?? 'energia',
    channel: body.channel ?? 'portal',
    message: body.message ?? 'Mensagem temporária',
    signalIds: body.signalIds ?? [],
  };
  const validated = validateCampaign(base);
  return { ...validated, ...body };
}
