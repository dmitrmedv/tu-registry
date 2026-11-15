import type { Department } from '@tu-registry/shared';
import type { AuthUser } from '../../types/express';
import { ApiError } from '../../utils/ApiError';
import { type RequestContext, recordAccessDenied } from '../audit/audit.service';

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

/**
 * Where a new application is registered: an admin chooses (their own department by default),
 * a user always registers into their own. Naming another department is refused and audited.
 */
export async function registrationDepartment(
  actor: Pick<AuthUser, 'id' | 'role' | 'department'>,
  requested: Department | undefined,
  context: RequestContext,
) {
  if (isAdmin(actor)) return requested ?? actor.department;
  if (requested && requested !== actor.department) {
    await recordAccessDenied(actor.id, { department: requested, required: 'ADMIN' }, context);
    throw ApiError.forbidden('Реєструвати заяви можна лише у своєму управлінні');
  }
  return actor.department;
}
