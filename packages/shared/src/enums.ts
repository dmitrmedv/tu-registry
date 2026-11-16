// Enums are declared as const tuples so the same source feeds TypeScript types,
// Zod schemas (z.enum(ROLES)) and Mongoose schema `enum` validators.

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const OBJECT_TYPES = ['DOMESTIC', 'NON_DOMESTIC'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Urban or rural locality of the object. */
export const AREA_TYPES = ['URBAN', 'RURAL'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

/** What is being connected. `OTHER` comes with the user's own wording (objectCategoryOther). */
export const OBJECT_CATEGORIES = [
  'LAND_PLOT',
  'RESIDENTIAL_HOUSE',
  'APARTMENT',
  'NON_RESIDENTIAL',
  'BIOGAS_PRODUCER',
  'OTHER',
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const REGISTRATION_MODES = ['AUTO', 'MANUAL'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const APPLICATION_STATUSES = ['ACTIVE', 'ANNULLED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_CHANGE_ACTIONS = ['CREATED', 'UPDATED', 'ANNULLED', 'RESTORED'] as const;
export type ApplicationChangeAction = (typeof APPLICATION_CHANGE_ACTIONS)[number];

export const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'PASSWORD_RESET',
  'SESSION_REUSE_DETECTED',
  'APPLICATION_CREATED',
  'APPLICATION_MANUAL_CREATED',
  'REG_NUMBER_CHANGED',
  'REG_DATE_CHANGED',
  'APPLICATION_ANNULLED',
  'APPLICATION_RESTORED',
  'APPLICATION_DELETED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'DEPARTMENT_ARCHIVED',
  'DEPARTMENT_RESTORED',
  'DEPARTMENT_DELETED',
  'ENGINEER_CREATED',
  'ENGINEER_UPDATED',
  'ENGINEER_DEACTIVATED',
  'ACCESS_DENIED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
