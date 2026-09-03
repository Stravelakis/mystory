/* =============================================================================
   THE LOCK

   One passcode, one long-lived signed cookie. There is exactly one person with
   an account here, so anything more elaborate is ceremony.

   The passcode is never stored — only a scrypt hash of it — and never leaves
   the server in any form. Sessions are stateless HMACs, so a restart does not
   sign you out and there is no session table to leak.
   ========================================================================== */

import crypto from 'crypto';

export const SESSION_COOKIE = 'mystory_session';
const SESSION_DAYS = 30;

/* ---- passcode ----------------------------------------------------------- */

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passcode.normalize('NFKC'), salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  try {
    const [scheme, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(keyB64, 'base64url');
    const actual = crypto.scryptSync(passcode.normalize('NFKC'), salt, expected.length);
    // Length is fixed by the stored hash, but timingSafeEqual throws on a
    // mismatch rather than returning false, so check first.
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---- session ------------------------------------------------------------ */

export function signSession(secret: string, days = SESSION_DAYS): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + days * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(secret: string, token?: string): boolean {
  if (!token || !secret) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

export function newSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token: string, secure: boolean): string {
  const days = SESSION_DAYS;
  return [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${days * 86400}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

/* ---- attempt throttle ---------------------------------------------------
   In memory and per source address. Enough to make guessing a four-digit
   passcode over a network pointless; it is not trying to be more than that. */

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export function throttled(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  if (a.until > Date.now()) return Math.ceil((a.until - Date.now()) / 1000);
  if (a.until) attempts.delete(key);
  return 0;
}

export function recordFailure(key: string): void {
  const a = attempts.get(key) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.until = Date.now() + LOCKOUT_MS;
    a.count = 0;
  }
  attempts.set(key, a);
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}
