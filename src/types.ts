export const segments = ['energia', 'tecnologia', 'servicos'] as const;
export type Segment = (typeof segments)[number];

export const eventTypes = ['page_view', 'click', 'preference', 'journey_completed'] as const;
export type EventType = (typeof eventTypes)[number];

export const eventPages = ['home', 'empresa', 'oportunidades', 'ajuda', 'preferencias'] as const;
export type EventPage = (typeof eventPages)[number];

export const eventTargets = [
  'page',
  'explorar',
  'ajuda',
  'energia',
  'tecnologia',
  'servicos',
  'concluir',
] as const;
export type EventTarget = (typeof eventTargets)[number];

export const actionStatuses = ['open', 'planned', 'done', 'dismissed'] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const campaignStatuses = ['draft', 'planned', 'active', 'completed', 'cancelled'] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const campaignChannels = ['email', 'whatsapp', 'phone', 'portal'] as const;
export type CampaignChannel = (typeof campaignChannels)[number];
export type UserRole = 'admin' | 'analyst';

export interface SessionRow {
  id: string;
  profile_id: string;
  token_hash: string;
  consent: 0 | 1;
  created_at: string;
  expires_at: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface Principal {
  id: string;
  role: UserRole;
  source: 'admin-token' | 'user-session';
}

export interface EventInput {
  id: string;
  type: EventType;
  page: EventPage;
  target: EventTarget;
  occurredAt: string;
}

export interface EventRow extends EventInput {
  sessionId: string;
  profileId: string;
  label: string;
  segment: Segment;
}

export interface AnalyticsFilter {
  from: string;
  to: string;
  segment: Segment | null;
  limit: number;
  offset: number;
  sort: 'occurredAt' | 'profileId';
  order: 'asc' | 'desc';
}

export interface Journey {
  profileId: string;
  label: string;
  segment: Segment;
  sessions: number;
  firstClick: EventTarget | null;
  lastSeen: string;
  completed: boolean;
  timeline: EventRow[];
}

export interface Signal {
  id: string;
  profileId: string;
  label: string;
  segment: Segment;
  rule: 'inactive-7d' | 'repeated-help' | 'opportunity-interest';
  title: string;
  reason: string;
  recommendation: string;
  priority: 'alta' | 'media' | 'baixa';
  status: ActionStatus;
}

export interface CampaignInput {
  name: string;
  segment: Segment;
  channel: CampaignChannel;
  message: string;
  signalIds: string[];
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      session?: SessionRow;
      principal?: Principal;
    }
  }
}
