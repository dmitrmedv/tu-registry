import { hasRegistrationRights, type Role } from '@tu-registry/shared';
import type { Request, RequestHandler } from 'express';
import { recordAccessDenied, requestContext } from '../modules/audit/audit.service';
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

/** Records the refusal in the audit log and returns the 403 to throw. */
async function denyAccess(req: Request, required: Record<string, unknown>, message?: string) {
  await recordAccessDenied(
    req.user?.id ?? null,
    { method: req.method, path: req.originalUrl, ...required },
    requestContext(req),
  );
  return ApiError.forbidden(message);
}

export function requireRole(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw await denyAccess(req, { requiredRoles: roles });
    }
    next();
  };
}

/** Administrators and users with the "authorized" flag (manual registration). */
export const requireRegistrationRights: RequestHandler = async (req, _res, next) => {
  if (!req.user || !hasRegistrationRights(req.user)) {
    throw await denyAccess(
      req,
      { required: 'canManageRegistration' },
      'Ця дія доступна лише уповноваженим користувачам',
    );
  }
  next();
};

/** Standard chain for private endpoints. */
export const requireAuth = [authenticate, requirePasswordChanged];
