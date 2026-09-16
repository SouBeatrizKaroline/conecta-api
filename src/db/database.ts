import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function migrate(db: DatabaseSync): void {
  if (!hasColumn(db, 'audit', 'actor_id')) db.exec('ALTER TABLE audit ADD COLUMN actor_id TEXT');
}

export function openDatabase(path = './data/conecta.sqlite'): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  migrate(db);
  const insert = db.prepare('INSERT OR IGNORE INTO profiles VALUES (?, ?, ?)');
  for (const [index, segment] of [
    'energia',
    'tecnologia',
    'servicos',
    'energia',
    'tecnologia',
    'servicos',
  ].entries()) {
    insert.run(`demo-0${index + 1}`, `Empresa demonstrativa 0${index + 1}`, segment);
  }
  return db;
}
