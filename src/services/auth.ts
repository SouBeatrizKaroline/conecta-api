import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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

// --- JWT (HS256) minimalista via node:crypto — sem dependência externa ---

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET ausente ou curto demais (min. 32 caracteres) no .env');
  }
  return secret;
}

// --- Usuárias ---

export function createUser(
  db: DatabaseSync,
  input: { name: string; email: string; password: string; role: UserRole },
) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    input.name,
    input.email,
    hashPassword(input.password),
    input.role,
    createdAt,
  );
  return { id, name: input.name, email: input.email, role: input.role, createdAt };
}

export function ensureAdminUser(
  db: DatabaseSync,
  email: string | undefined,
  password: string | undefined,
): void {
  if (!email || !password) return;
  const normalized = email.trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(normalized)) return;
  createUser(db, { name: 'Administradora Conecta', email: normalized, password, role: 'admin' });
}

// --- Login / sessão via JWT ---

export function login(db: DatabaseSync, email: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as UserRow | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return null;

  const expiresIn = 8 * 3_600; // 8h, igual ao comportamento anterior
  const token = signJwt({ sub: user.id, role: user.role }, jwtSecret(), expiresIn);

  return {
    token,
    expiresIn,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export function resolvePrincipal(
  db: DatabaseSync,
  token: string,
  adminToken: string,
): Principal | null {
  // Token administrativo fixo continua funcionando como antes.
  if (token && adminToken) {
    const actual = Buffer.from(tokenHash(token));
    const expected = Buffer.from(tokenHash(adminToken));
    if (actual.length === expected.length && timingSafeEqual(actual, expected))
      return { id: 'system-admin', role: 'admin', source: 'admin-token' };
  }

  if (!token) return null;
  const payload = verifyJwt<{ sub: string; role: UserRole }>(token, jwtSecret());
  if (!payload) return null;

  // Confirma que a usuária ainda existe (evita token válido de conta apagada).
  const exists = db.prepare('SELECT id FROM users WHERE id=?').get(payload.sub);
  if (!exists) return null;

  return { id: payload.sub, role: payload.role, source: 'user-session' };
}

export function logout(_db: DatabaseSync, _token: string): void {
  // JWT é stateless: não há sessão no servidor para revogar.
  // O cliente descarta o token; ele expira sozinho em `expiresIn` segundos.
}
