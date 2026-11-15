import type { UserDto } from '@tu-registry/shared';

/** The authenticated user, loaded from the database on every request. */
export type AuthUser = UserDto & { sessionId: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
