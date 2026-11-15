import mongoose, { type Types } from 'mongoose';
import { env } from '../../config/env';
import { RefreshSession } from './refreshSession.model';
import { generateRefreshToken, hashToken } from './tokens';

export function sessionExpiry(from = new Date()) {
  return new Date(from.getTime() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

/** Creates a session and returns the raw refresh token (only its hash is stored). */
export async function createSession(userId: Types.ObjectId | string) {
  const refreshToken = generateRefreshToken();
  const session = await RefreshSession.create({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: sessionExpiry(),
  });
  return { session, refreshToken };
}

/** Ends every active session of a user, optionally keeping the current one. */
export async function revokeAllSessions(
  userId: Types.ObjectId | string,
  options: { exceptSessionId?: string } = {},
) {
  await RefreshSession.updateMany(
    {
      userId,
      revokedAt: null,
      ...(options.exceptSessionId && { _id: mongoose.trusted({ $ne: options.exceptSessionId }) }),
    },
    { revokedAt: new Date() },
  );
}
