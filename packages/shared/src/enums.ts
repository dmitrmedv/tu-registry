// Enums are declared as const tuples so the same source feeds TypeScript types,
// Zod schemas (z.enum(ROLES)) and Mongoose schema `enum` validators.

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const OBJECT_TYPES = ['DOMESTIC', 'NON_DOMESTIC'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const REGISTRATION_MODES = ['AUTO', 'MANUAL'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export const APPLICATION_STATUSES = ['ACTIVE', 'ANNULLED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
