import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(s).digest();

/**
 * Optional HTTP Basic guard for the team-only pages (list + upload).
 * Returns null when auth is disabled.
 */
export function createBasicAuth(user, password) {
  if (!user || !password) return null;
  const expected = digest(`${user}:${password}`);

  return function authorized(req) {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme !== 'Basic' || !encoded) return false;
    const given = digest(Buffer.from(encoded, 'base64').toString('utf8'));
    return timingSafeEqual(given, expected);
  };
}
