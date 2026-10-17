import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(s).digest();

/** Constant-time comparison against a configured secret; null when not configured. */
export function createSecretCheck(secret) {
  if (!secret) return null;
  const expected = digest(secret);
  return (given) => typeof given === 'string' && timingSafeEqual(digest(given), expected);
}

/**
 * Optional HTTP Basic guard for the team-only pages (list + upload).
 * Returns null when auth is disabled.
 */
export function createBasicAuth(user, password) {
  const check = user && password ? createSecretCheck(`${user}:${password}`) : null;
  if (!check) return null;

  return function authorized(req) {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme !== 'Basic' || !encoded) return false;
    return check(Buffer.from(encoded, 'base64').toString('utf8'));
  };
}

/**
 * Stateless login sessions for the team pages: the cookie carries an expiry
 * signed with a key derived from the access password, so sessions survive
 * restarts/updates and changing the password logs everyone out.
 * Returns null when no access password is configured.
 */
export function createSessions(password, { cookie = 'pa_session', maxAgeDays = 30, now = Date.now } = {}) {
  if (!password) return null;
  const check = createSecretCheck(password);
  const key = createHash('sha256').update(`pa-session:${password}`).digest();
  const sign = (exp) => createHmac('sha256', key).update(String(exp)).digest('base64url');
  const maxAge = maxAgeDays * 24 * 60 * 60;

  return {
    checkPassword: check,
    /** Set-Cookie value for a fresh session. */
    issue() {
      const exp = Math.floor(now() / 1000) + maxAge;
      return `${cookie}=${exp}.${sign(exp)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`;
    },
    clear() {
      return `${cookie}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
    },
    valid(req) {
      const raw = (req.headers.cookie || '')
        .split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${cookie}=`));
      if (!raw) return false;
      const [exp, mac] = raw.slice(cookie.length + 1).split('.');
      if (!/^\d+$/.test(exp ?? '') || !mac || Number(exp) * 1000 < now()) return false;
      const expected = Buffer.from(sign(exp));
      const given = Buffer.from(mac);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

/**
 * In-memory brute-force guard: after `max` failures within `windowMs` a key
 * (client IP) is blocked for `windowMs`. A success clears the key.
 */
export function createAttemptLimiter({ max = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map();

  function current(key) {
    const entry = entries.get(key);
    if (entry && now() - entry.since > windowMs && !(entry.blockedUntil > now())) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    /** Milliseconds until the key may try again, 0 if allowed. */
    retryAfter(key) {
      const entry = current(key);
      return entry?.blockedUntil > now() ? entry.blockedUntil - now() : 0;
    },
    fail(key) {
      const entry = current(key) ?? { count: 0, since: now(), blockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= max) entry.blockedUntil = now() + windowMs;
      entries.set(key, entry);
      if (entries.size > 10_000) {
        for (const k of entries.keys()) current(k);
      }
    },
    reset(key) {
      entries.delete(key);
    },
  };
}
