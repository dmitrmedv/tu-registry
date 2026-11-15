import type { ApplicationDto, UserDto } from '@tu-registry/shared';

/**
 * What the UI offers to whom. Mirrors the server rules (the server always decides):
 * content — owner or admin; date/number — admin or owner with the "authorized" flag;
 * annul — owner or admin; restore — admin. Annulled applications cannot be edited.
 */
type User = Pick<UserDto, 'id' | 'role' | 'canManageRegistration'>;
type Application = Pick<ApplicationDto, 'createdBy' | 'status'>;

const isOwner = (app: Application, user: User) => app.createdBy.id === user.id;
const isAdmin = (user: User) => user.role === 'ADMIN';
const isActive = (app: Application) => app.status === 'ACTIVE';

export const canEdit = (app: Application, user: User) =>
  isActive(app) && (isOwner(app, user) || isAdmin(user));

export const canEditRegistration = (app: Application, user: User) =>
  isActive(app) && (isAdmin(user) || (isOwner(app, user) && user.canManageRegistration));

export const canAnnul = (app: Application, user: User) =>
  isActive(app) && (isOwner(app, user) || isAdmin(user));

export const canRestore = (app: Application, user: User) => !isActive(app) && isAdmin(user);
