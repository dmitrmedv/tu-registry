import type { ApplicationDto, UserDto } from '@tu-registry/shared';

/**
 * What the UI offers to whom. Mirrors the server rules (the server always decides): a user
 * works with their department's applications — content and annulment for anyone there,
 * date/number for "authorized" users there; an admin everywhere, plus moving an application
 * to another department, restoring and deleting. Annulled applications cannot be edited.
 */
type User = Pick<UserDto, 'role' | 'department' | 'canManageRegistration'>;
type Application = Pick<ApplicationDto, 'department' | 'status'>;

const isAdmin = (user: User) => user.role === 'ADMIN';
const isActive = (app: Application) => app.status === 'ACTIVE';
const worksWith = (app: Application, user: User) =>
  isAdmin(user) || app.department === user.department;

export const canEdit = (app: Application, user: User) => isActive(app) && worksWith(app, user);

export const canEditRegistration = (app: Application, user: User) =>
  canEdit(app, user) && (isAdmin(user) || user.canManageRegistration);

export const canChangeDepartment = (app: Application, user: User) => isActive(app) && isAdmin(user);

export const canAnnul = (app: Application, user: User) => isActive(app) && worksWith(app, user);

export const canRestore = (app: Application, user: User) => !isActive(app) && isAdmin(user);

export const canDelete = (_app: Application, user: User) => isAdmin(user);

/** Responses and technical conditions: added, edited and cancelled like the application. */
export const canManageDocuments = canEdit;

/** A cancelled response or technical conditions come back by an admin's decision. */
export const canRestoreDocument = (app: Application, user: User) => isActive(app) && isAdmin(user);
