import type { Role } from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { recordAudit, requestContext } from '../modules/audit/audit.service';
import { RefreshSession } from '../modules/auth/refreshSession.model';
import { verifyAccessToken } from '../modules/auth/tokens';
import { toUserDto } from '../modules/users/user.dto';
import { User } from '../modules/users/user.model';
import { ApiError } from '../utils/ApiError';

/**
 * Verifies the access token, then loads the user AND the session from the database,
 * so deactivation, permission changes, logout and password resets apply immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();

  let claims: { userId: string; sessionId: string };
  try {
    claims = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    throw new ApiError(401, 'TOKEN_INVALID', 'Токен недійсний або прострочений');
  }

  const [user, session] = await Promise.all([
    User.findById(claims.userId),
    RefreshSession.findById(claims.sessionId),
  ]);
  const sessionValid =
    session &&
    !session.revokedAt &&
    session.expiresAt > new Date() &&
    session.userId.equals(claims.userId);
  if (!user || !user.isActive || !sessionValid) {
    throw new ApiError(401, 'SESSION_ENDED', 'Сесія завершилась. Увійдіть знову');
  }

  req.user = { ...toUserDto(user), sessionId: claims.sessionId };
  next();
};

/** Blocks everything except auth endpoints until a temporary password is replaced. */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword) {
    throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'Спочатку змініть тимчасовий пароль');
  }
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      await recordAudit(
        {
          action: 'ACCESS_DENIED',
          actor: req.user?.id ?? null,
          details: { method: req.method, path: req.originalUrl, requiredRoles: roles },
        },
        requestContext(req),
      );
      throw ApiError.forbidden();
    }
    next();
  };
}

/** Standard chain for private endpoints. */
export const requireAuth = [authenticate, requirePasswordChanged];
