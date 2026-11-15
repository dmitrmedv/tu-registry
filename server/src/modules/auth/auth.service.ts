import type { ChangePasswordInput, LoginInput } from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import { hashPassword, verifyPassword } from '../../utils/password';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { toUserDto } from '../users/user.dto';
import { User } from '../users/user.model';
import { RefreshSession } from './refreshSession.model';
import { createSession, revokeAllSessions } from './session.service';
import { hashToken, signAccessToken } from './tokens';

/**
 * Two browser tabs may refresh with the same cookie at the same moment. A token reused
 * within this window is treated as such a race, not as theft.
 */
const REUSE_GRACE_MS = 30_000;

const invalidCredentials = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Невірний логін або пароль');
const sessionEnded = () => new ApiError(401, 'SESSION_ENDED', 'Сесія завершилась. Увійдіть знову');

// Compared against when the login does not exist, so response time does not reveal it.
let timingDummyHash: Promise<string> | undefined;
const dummyHash = () => (timingDummyHash ??= hashPassword('timing-equalizer-not-a-password'));

async function issueTokens(user: Parameters<typeof toUserDto>[0]) {
  const { session, refreshToken } = await createSession(user._id);
  return {
    user: toUserDto(user),
    accessToken: signAccessToken(user.id as string, session.id as string),
    refreshToken,
    refreshExpiresAt: session.expiresAt,
  };
}

export async function login(input: LoginInput, context: RequestContext) {
  const user = await User.findOne({ login: input.login }).select('+passwordHash');
  const passwordOk = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await verifyPassword(input.password, await dummyHash()), false);

  if (!user || !passwordOk || !user.isActive) {
    const reason = !user ? 'UNKNOWN_LOGIN' : !passwordOk ? 'WRONG_PASSWORD' : 'INACTIVE_USER';
    await recordAudit(
      { action: 'LOGIN_FAILED', actor: user?._id ?? null, details: { login: input.login, reason } },
      context,
    );
    throw invalidCredentials();
  }

  user.lastLoginAt = new Date();
  await user.save();
  const result = await issueTokens(user);
  await recordAudit({ action: 'LOGIN_SUCCESS', actor: user._id }, context);
  return result;
}

export async function refresh(refreshToken: string | undefined, context: RequestContext) {
  if (!refreshToken) throw sessionEnded();

  const session = await RefreshSession.findOne({ tokenHash: hashToken(refreshToken) });
  if (!session || session.expiresAt <= new Date()) throw sessionEnded();

  if (session.revokedAt) {
    if (Date.now() - session.revokedAt.getTime() > REUSE_GRACE_MS) {
      // A rotated-out token came back: it may have been stolen. End every session.
      await revokeAllSessions(session.userId);
      await recordAudit(
        {
          action: 'SESSION_REUSE_DETECTED',
          actor: session.userId,
          entityType: 'User',
          entityId: session.userId,
        },
        context,
      );
    }
    throw sessionEnded();
  }

  // Rotate atomically: only one concurrent request may consume this session.
  const { modifiedCount } = await RefreshSession.updateOne(
    { _id: session._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (modifiedCount === 0) throw sessionEnded();

  const user = await User.findById(session.userId);
  if (!user || !user.isActive) throw sessionEnded();

  return issueTokens(user);
}

export async function logout(refreshToken: string | undefined, context: RequestContext) {
  if (!refreshToken) return;
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { revokedAt: new Date() },
  );
  if (session) await recordAudit({ action: 'LOGOUT', actor: session.userId }, context);
}

export async function changePassword(
  userId: string,
  sessionId: string,
  input: ChangePasswordInput,
  context: RequestContext,
) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw sessionEnded();

  // 400, not 401: a wrong current password must not look like an expired session to the client.
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'Поточний пароль невірний');
  }
  if (input.newPassword.toLowerCase() === user.login) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Пароль не може збігатися з логіном');
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.mustChangePassword = false;
  await user.save();
  // Other devices must log in with the new password; this session stays.
  await revokeAllSessions(user._id, { exceptSessionId: sessionId });
  await recordAudit({ action: 'PASSWORD_CHANGED', actor: user._id }, context);

  return toUserDto(user);
}
