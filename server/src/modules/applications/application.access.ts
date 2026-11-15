import type { Department } from '@tu-registry/shared';
import type { AuthUser } from '../../types/express';
import { ApiError } from '../../utils/ApiError';

export type Actor = Pick<AuthUser, 'id' | 'role' | 'department' | 'canManageRegistration'>;

export const isAdmin = (actor: Pick<AuthUser, 'role'>) => actor.role === 'ADMIN';

/** The department a user is limited to; undefined for an admin, who sees every department. */
export const departmentScope = (actor: Pick<AuthUser, 'role' | 'department'>) =>
  isAdmin(actor) ? undefined : actor.department;

/** Users work with their own department's applications only (stage 13); admins with all. */
export const canAccess = (
  app: { department: Department },
  actor: Pick<AuthUser, 'role' | 'department'>,
) => isAdmin(actor) || app.department === actor.department;

/**
 * Another department's application is "not found" for a user, not "forbidden": even its
 * existence is not revealed.
 */
export const applicationNotFound = () => ApiError.notFound('Заяву не знайдено');
