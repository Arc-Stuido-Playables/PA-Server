import { createHash, timingSafeEqual } from 'node:crypto';

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
