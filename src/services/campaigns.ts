import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CampaignInput, CampaignStatus, Principal, Segment } from '../types.ts';

interface CampaignRow {
  id: string;
  name: string;
  segment: Segment;
  channel: CampaignInput['channel'];
  message: string;
  status: CampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function serialize(db: DatabaseSync, row: CampaignRow) {
  const signalIds = (
    db.prepare('SELECT signal_id FROM campaign_signals WHERE campaign_id=? ORDER BY signal_id').all(row.id) as Array<{ signal_id: string }>
  ).map((item) => item.signal_id);
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    channel: row.channel,
    message: row.message,
    status: row.status,
    signalIds,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function replaceSignals(db: DatabaseSync, campaignId: string, signalIds: string[]): void {
  db.prepare('DELETE FROM campaign_signals WHERE campaign_id=?').run(campaignId);
  const insert = db.prepare('INSERT INTO campaign_signals VALUES (?, ?)');
  for (const signalId of signalIds) insert.run(campaignId, signalId);
}

export function createCampaign(db: DatabaseSync, input: CampaignInput, principal: Principal) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO campaigns VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      input.name,
      input.segment,
      input.channel,
      input.message,
      'draft',
      principal.source === 'user-session' ? principal.id : null,
      now,
      now,
    );
    replaceSignals(db, id, input.signalIds);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getCampaign(db, id);
}

export function getCampaign(db: DatabaseSync, id: string) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id=?').get(id) as CampaignRow | undefined;
  return row ? serialize(db, row) : null;
}

export function listCampaigns(
  db: DatabaseSync,
  filter: {
    segment: Segment | null;
    status: CampaignStatus | null;
    limit: number;
    offset: number;
    order: 'asc' | 'desc';
  },
) {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (filter.segment) {
    where.push('segment=?');
    params.push(filter.segment);
  }
  if (filter.status) {
    where.push('status=?');
    params.push(filter.status);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT count(*) AS total FROM campaigns ${clause}`).get(...params) as { total: number }).total;
  const rows = db
    .prepare(
      `SELECT * FROM campaigns ${clause} ORDER BY updated_at ${filter.order.toUpperCase()} LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.limit, filter.offset) as unknown as CampaignRow[];
  return { total, items: rows.map((row) => serialize(db, row)) };
}

export function updateCampaign(
  db: DatabaseSync,
  id: string,
  current: NonNullable<ReturnType<typeof getCampaign>>,
  patch: Partial<CampaignInput> & { status?: CampaignStatus },
) {
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE campaigns SET name=?,segment=?,channel=?,message=?,status=?,updated_at=? WHERE id=?`,
    ).run(next.name, next.segment, next.channel, next.message, next.status, next.updatedAt, id);
    if (patch.signalIds) replaceSignals(db, id, patch.signalIds);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getCampaign(db, id);
}

export function campaignStatusCounts(db: DatabaseSync) {
  return db.prepare('SELECT status AS label,count(*) AS value FROM campaigns GROUP BY status ORDER BY status').all();
}
