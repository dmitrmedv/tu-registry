import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const ALGORITHM = 'HS256';

/** Short-lived access token. It carries only ids; permissions are read from the DB per request. */
export function signAccessToken(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

/** Throws if the token is invalid, expired, or signed with any other algorithm. */
export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string'
  ) {
    throw new Error('Malformed access token payload');
  }
  return { userId: payload.sub, sessionId: payload.sid };
}

/**
 * Opaque refresh token. Not a JWT: the session is looked up in the database anyway
 * (to support revocation), so a random value is simpler and leaks nothing.
 */
export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
