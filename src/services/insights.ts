import type { DatabaseSync } from 'node:sqlite';
import type { AnalyticsFilter } from '../types.ts';
import { selectEvents, signals } from './analytics.ts';

export function historicalSignals(db: DatabaseSync, filter: AnalyticsFilter, now = Date.now()) {
  const evaluatedAt = Math.min(now, Date.parse(`${filter.to}T23:59:59.999Z`));
  const observed = selectEvents(db, filter).filter(
    (event) => Date.parse(event.occurredAt) <= evaluatedAt,
  );
  const profiles = new Set(observed.map((event) => event.profileId));
  const history = selectEvents(db, { ...filter, from: '0001-01-01' }).filter(
    (event) => profiles.has(event.profileId) && Date.parse(event.occurredAt) <= evaluatedAt,
  );
  const currentEvents = selectEvents(db, {
    ...filter,
    from: '0001-01-01',
    to: '9999-12-31',
    offset: 0,
    limit: 200,
  }).filter((event) => Date.parse(event.occurredAt) <= now);
  const active = new Set(signals(db, currentEvents, now).map((signal) => signal.id));
  const items = signals(db, history, evaluatedAt).map((signal) => ({
    ...signal,
    ruleVersion: '2',
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    activeNow: active.has(signal.id),
    statusScope: 'current',
    reason: signal.reason.replaceAll('no período', 'até a data de referência'),
  }));
  return {
    simulated: true,
    filter,
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    selectionScope: 'profiles-observed-in-range',
    evidenceScope: 'history-through-reference',
    total: items.length,
    items: items.slice(filter.offset, filter.offset + filter.limit),
  };
}
