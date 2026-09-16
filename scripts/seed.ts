import { randomUUID, createHash } from 'node:crypto';
import { openDatabase } from '../src/db/database.ts';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
export function seed(db: DatabaseSync): boolean {
  // Completa a base demonstrativa se ela ainda não atingiu o recorte esperado.
  if ((db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n >= 37) return false;
  db.exec('BEGIN');
  try {
    for (let p = 1; p <= 6; p++) {
      for (let visit = 0; visit < (p % 2 ? 2 : 1); visit++) {
        const id = randomUUID();
        const time = Date.now() - (p === 2 ? 10 : p + visit) * 86400_000;
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?, 1, ?, ?)').run(
          id,
          `demo-0${p}`,
          createHash('sha256').update(randomUUID()).digest('hex'),
          new Date(time).toISOString(),
          new Date(time + 3600_000).toISOString(),
        );
        const steps: Array<[string, string, string]> = [
          ['page_view', 'home', 'page'],
          ['click', 'oportunidades', 'explorar'],
          ['page_view', 'oportunidades', 'page'],
          ['click', p % 2 ? 'ajuda' : 'oportunidades', p % 2 ? 'ajuda' : 'explorar'],
        ];
        if (p === 6) steps.push(['journey_completed', 'preferencias', 'concluir']);
        for (const [index, [type, page, target]] of steps.entries()) {
          const at = new Date(time + index * 60_000).toISOString();
          db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            randomUUID(),
            id,
            type,
            page,
            target,
            at,
            at,
          );
        }
      }
    }
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDatabase(process.env.DB_PATH);
  console.log(
    seed(db)
      ? '37 eventos fictícios gerados para seis empresas demonstrativas.'
      : 'Base com eventos preservada; nenhum dado foi sobrescrito.',
  );
  db.close();
}
