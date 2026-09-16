import type { DatabaseSync } from 'node:sqlite';
import type { ActionStatus, AnalyticsFilter, EventRow, Journey, Signal } from '../types.ts';

export function selectEvents(db: DatabaseSync, filter: AnalyticsFilter): EventRow[] {
  const direction = filter.order === 'desc' ? 'DESC' : 'ASC';
  const primary = filter.sort === 'profileId' ? 's.profile_id' : 'e.occurred_at';
  return db
    .prepare(
      `SELECT e.id, e.session_id AS sessionId, s.profile_id AS profileId,
       p.label, p.segment, e.type, e.page, e.target, e.occurred_at AS occurredAt
       FROM events e JOIN sessions s ON s.id=e.session_id JOIN profiles p ON p.id=s.profile_id
       WHERE s.consent=1 AND e.occurred_at>=? AND e.occurred_at<=?
       AND (? IS NULL OR p.segment=?) ORDER BY ${primary} ${direction},e.occurred_at ${direction},e.id ${direction}`,
    )
    .all(
      `${filter.from}T00:00:00.000Z`,
      `${filter.to}T23:59:59.999Z`,
      filter.segment,
      filter.segment,
    ) as unknown as EventRow[];
}

function counts(events: EventRow[], getKey: (event: EventRow) => string) {
  const data = new Map<string, number>();
  for (const event of events) {
    const key = getKey(event);
    data.set(key, (data.get(key) ?? 0) + 1);
  }
  return [...data]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function journeys(events: EventRow[]): Journey[] {
  const grouped = new Map<string, EventRow[]>();
  for (const event of events) {
    const timeline = grouped.get(event.profileId) ?? [];
    timeline.push(event);
    grouped.set(event.profileId, timeline);
  }
  return [...grouped].map(([profileId, timeline]) => {
    const first = timeline[0];
    const last = timeline.at(-1);
    if (!first || !last) throw new Error('Jornada sem eventos.');
    return {
      profileId,
      label: first.label,
      segment: first.segment,
      sessions: new Set(timeline.map((event) => event.sessionId)).size,
      firstClick: timeline.find((event) => event.type === 'click')?.target ?? null,
      lastSeen: last.occurredAt,
      completed: timeline.some((event) => event.type === 'journey_completed'),
      timeline,
    };
  });
}

export function summary(events: EventRow[]) {
  const grouped = journeys(events);
  const firstBySession = new Map<string, EventRow>();
  for (const event of events)
    if (event.type === 'click' && !firstBySession.has(event.sessionId))
      firstBySession.set(event.sessionId, event);
  return {
    events: events.length,
    profiles: grouped.length,
    sessions: new Set(events.map((event) => event.sessionId)).size,
    returningProfiles: grouped.filter((journey) => journey.sessions > 1).length,
    completedProfiles: grouped.filter((journey) => journey.completed).length,
    pages: counts(
      events.filter((event) => event.type === 'page_view'),
      (event) => event.page,
    ),
    firstClicks: counts([...firstBySession.values()], (event) => event.target),
    daily: counts(events, (event) => event.occurredAt.slice(0, 10)).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  };
}

export function signals(db: DatabaseSync, events: EventRow[], now = Date.now()): Signal[] {
  const result: Signal[] = [];
  for (const journey of journeys(events)) {
    const add = (
      rule: Signal['rule'],
      title: string,
      reason: string,
      recommendation: string,
      priority: Signal['priority'],
    ) => {
      const id = `${journey.profileId}:${rule}`;
      const action = db.prepare('SELECT status FROM actions WHERE signal_id=?').get(id) as
        | { status: ActionStatus }
        | undefined;
      result.push({
        id,
        profileId: journey.profileId,
        label: journey.label,
        segment: journey.segment,
        rule,
        title,
        reason,
        recommendation,
        priority,
        status: action?.status ?? 'open',
      });
    };
    const days = Math.floor((now - Date.parse(journey.lastSeen)) / 86_400_000);
    if (days >= 7 && !journey.completed)
      add(
        'inactive-7d',
        'Jornada sem retorno',
        `${days} dias desde o último evento observado no período.`,
        'Revisar contexto e planejar orientação para retomar a jornada.',
        'alta',
      );
    const help = journey.timeline.filter(
      (event) => event.type === 'click' && event.target === 'ajuda',
    ).length;
    if (help >= 2)
      add(
        'repeated-help',
        'Ajuda recorrente',
        `${help} cliques em ajuda no período.`,
        'Revisar a orientação disponível e oferecer um próximo passo claro.',
        'media',
      );
    const opportunities = journey.timeline.filter(
      (event) => event.type === 'click' && event.target === 'explorar',
    ).length;
    if (opportunities >= 2 && !journey.completed)
      add(
        'opportunity-interest',
        'Interesse em oportunidades',
        `${opportunities} explorações sem conclusão observada no período.`,
        'Planejar conteúdo relacionado ao interesse demonstrado.',
        'media',
      );
  }
  return result;
}

export function csv(events: Array<Partial<Record<keyof EventRow, unknown>>>): string {
  const cell = (value: unknown): string => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const columns: Array<keyof EventRow> = [
    'id',
    'sessionId',
    'profileId',
    'segment',
    'type',
    'page',
    'target',
    'occurredAt',
  ];
  return (
    '\uFEFF' +
    [
      columns.join(','),
      ...events.map((row) => columns.map((key) => cell(row[key])).join(',')),
    ].join('\r\n')
  );
}
