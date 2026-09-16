import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Principal, UserRole, UserRow } from '../types.ts';

export const tokenHash = (value: string): string => createHash('sha256').update(value).digest('hex');

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function createUser(db: DatabaseSync, input: { name: string; email: string; password: string; role: UserRole }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(id, input.name, input.email, hashPassword(input.password), input.role, createdAt);
  return { id, name: input.name, email: input.email, role: input.role, createdAt };
}

export function ensureAdminUser(db: DatabaseSync, email: string | undefined, password: string | undefined): void {
  if (!email || !password) return;
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(normalized)) return;
  createUser(db, { name: 'Administradora Conecta', email: normalized, password, role: 'admin' });
}

export function login(db: DatabaseSync, email: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 8 * 3_600_000).toISOString();
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(createdAt);
  db.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?)').run(id, user.id, tokenHash(token), createdAt, expiresAt);
  return { token, expiresIn: 28_800, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

export function resolvePrincipal(db: DatabaseSync, token: string, adminToken: string): Principal | null {
  if (token && adminToken) {
    const actual = Buffer.from(tokenHash(token));
    const expected = Buffer.from(tokenHash(adminToken));
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return { id: 'system-admin', role: 'admin', source: 'admin-token' };
  }
  const row = db.prepare(`SELECT u.id,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>=?`).get(tokenHash(token), new Date().toISOString()) as { id: string; role: UserRole } | undefined;
  return row ? { id: row.id, role: row.role, source: 'user-session' } : null;
}

export function logout(db: DatabaseSync, token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash(token));
}
