// Enums are declared as const tuples so the same source feeds TypeScript types,
// Zod schemas (z.enum(ROLES)) and Mongoose schema `enum` validators.

export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const OBJECT_TYPES = ['DOMESTIC', 'NON_DOMESTIC'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Urban or rural locality of the object. */
export const AREA_TYPES = ['URBAN', 'RURAL'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

/** New gasification, or reconstruction of a connection that exists (agreed 2026-11-18). */
export const GASIFICATION_TYPES = ['NEW', 'RECONSTRUCTION'] as const;
export type GasificationType = (typeof GASIFICATION_TYPES)[number];

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

/** CANCELLED and DELETED: of the application's documents (an application is annulled). */
export const APPLICATION_CHANGE_ACTIONS = [
  'CREATED',
  'UPDATED',
  'ANNULLED',
  'RESTORED',
  'CANCELLED',
  'DELETED',
] as const;
export type ApplicationChangeAction = (typeof APPLICATION_CHANGE_ACTIONS)[number];

/**
 * The documents whose changes the application's «Історія змін» shows besides its own fields
 * (agreed 2026-11-19). A new module of the card adds its kind here.
 */
export const HISTORY_DOCUMENT_KINDS = [
  'RESPONSE',
  'TECHNICAL_CONDITIONS',
  'TU_PAYMENT',
  'CONTRACT',
] as const;
export type HistoryDocumentKind = (typeof HISTORY_DOCUMENT_KINDS)[number];

/**
 * Where the processing of an application stands (stage 17.5), derived from its documents.
 * Annulment is the application's own `status`, shown instead of this. New stages go here.
 */
export const PROCESSING_STAGES = ['REGISTERED', 'IN_PROGRESS', 'RESPONDED', 'TU_PREPARED'] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

/** Technical conditions (stage 17.4): how the object is connected. */
export const CONNECTION_TYPES = [
  'STANDARD',
  'NON_STANDARD',
  'NON_STANDARD_CAPACITY',
  'RECONSTRUCTION',
] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const GAS_PRESSURES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type GasPressure = (typeof GAS_PRESSURES)[number];

export const CONNECTION_POINTS = ['ABOVE_GROUND', 'UNDERGROUND'] as const;
export type ConnectionPoint = (typeof CONNECTION_POINTS)[number];

/** A calendar exception: a weekday off, or a Saturday/Sunday worked (stage 17.2). */
export const CALENDAR_DAY_KINDS = ['NON_WORKING', 'WORKING'] as const;
export type CalendarDayKind = (typeof CALENDAR_DAY_KINDS)[number];

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
  'CALENDAR_DAY_CREATED',
  'CALENDAR_DAY_UPDATED',
  'CALENDAR_DAY_DELETED',
  'RESPONSE_CREATED',
  'RESPONSE_UPDATED',
  'RESPONSE_CANCELLED',
  'RESPONSE_RESTORED',
  'RESPONSE_DELETED',
  'TU_CREATED',
  'TU_UPDATED',
  'TU_CANCELLED',
  'TU_RESTORED',
  'TU_DELETED',
  'TU_PAYMENT_CREATED',
  'TU_PAYMENT_UPDATED',
  'TU_PAYMENT_DELETED',
  'CONTRACT_CREATED',
  'CONTRACT_UPDATED',
  'CONTRACT_CANCELLED',
  'CONTRACT_DELETED',
  'ACCESS_DENIED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
