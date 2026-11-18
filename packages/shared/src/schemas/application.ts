import { z } from 'zod';
import {
  AREA_TYPES,
  type AreaType,
  GASIFICATION_TYPES,
  type GasificationType,
  type ApplicationChangeAction,
  type ApplicationStatus,
  OBJECT_CATEGORIES,
  OBJECT_TYPES,
  type ObjectCategory,
  type ObjectType,
  type ProcessingStage,
  type RegistrationMode,
} from '../enums';
import type { Department } from '../departments';
import { normalizePhone } from '../phone';
import type { ScanDto } from '../scan';
import { departmentField } from '../departments';

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label}: обовʼязкове поле`)
    .max(max, `${label}: не більше ${max} символів`);

/** Optional text: an empty string means "not provided". */
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}: не більше ${max} символів`)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

export const phoneField = z
  .string()
  .trim()
  .min(1, 'Телефон: обовʼязкове поле')
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Невірний номер телефону. Приклад: 067 123 45 67',
      });
      return z.NEVER;
    }
    return normalized;
  });

/** Optional: an empty string means "no email". */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email: не більше 254 символів')
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Невірний email')
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const OBJECT_CATEGORY_OTHER_MAX = 200;
export const SETTLEMENT_MAX = 100;
export const COMMENT_MAX = 2000;
/** A personal account (domestic) or a contract number (non-domestic), as written: free text. */
export const ACCOUNT_NUMBER_MAX = 50;

const objectCategoryField = z.enum(OBJECT_CATEGORIES, { error: 'Оберіть категорію обʼєкта' });
const otherRequired = 'Уточніть категорію обʼєкта';

const applicationFields = z.object({
  customer: requiredText('Замовник', 300),
  customerRepresentative: optionalText('Представник замовника', 300),
  phone: phoneField,
  email: emailField,
  settlement: requiredText('Населений пункт', SETTLEMENT_MAX),
  objectAddress: requiredText('Адреса обʼєкта', 500),
  areaType: z.enum(AREA_TYPES, { error: 'Оберіть місцевість' }),
  gasificationType: z.enum(GASIFICATION_TYPES, {
    error: 'Оберіть: нова газифікація чи реконструкція',
  }),
  objectType: z.enum(OBJECT_TYPES, { error: 'Оберіть тип обʼєкта' }),
  objectCategory: objectCategoryField,
  accountNumber: optionalText('Особовий рахунок / № договору', ACCOUNT_NUMBER_MAX),
  // Used only with OTHER; the server drops it for any other category.
  objectCategoryOther: optionalText('Категорія', OBJECT_CATEGORY_OTHER_MAX),
  comment: optionalText('Коментар', COMMENT_MAX),
  /** Admins choose where to register; users may only name their own (or omit it). */
  department: departmentField.optional(),
});

type CategoryInput = { objectCategory?: ObjectCategory; objectCategoryOther?: string | null };

/** "Інше" is only meaningful with the user's own wording. */
const requireOtherWording = (data: CategoryInput, ctx: z.RefinementCtx) => {
  if (data.objectCategory === 'OTHER' && !data.objectCategoryOther) {
    ctx.addIssue({ code: 'custom', path: ['objectCategoryOther'], message: otherRequired });
  }
};

export const createApplicationSchema = applicationFields.strict().superRefine(requireOtherWording);

export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type CreateApplicationData = z.output<typeof createApplicationSchema>;

export const MAX_REG_SEQ = 999_999;

/**
 * Sequence number within a year, typed by the user as digits ("14"). The year comes from
 * the registration date, so "14" on a 2024 date becomes "14т/24".
 */
export const regSeqField = z.preprocess(
  // The form sends a string, an API client may send a number: one rule set for both.
  // (A z.union would replace these messages with a generic "Invalid input".)
  (value) => (typeof value === 'number' ? String(value) : value),
  z
    .string('Вкажіть порядковий номер')
    .trim()
    .min(1, { error: 'Вкажіть порядковий номер', abort: true })
    .regex(/^\d+$/, 'Вкажіть порядковий номер (лише цифри)')
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1, 'Номер має бути більшим за нуль')
        .max(MAX_REG_SEQ, `Номер не може перевищувати ${MAX_REG_SEQ}`),
    ),
);

/** "YYYY-MM-DD" that is a real calendar date. */
export const regDateField = z.iso.date('Вкажіть коректну дату реєстрації');

/**
 * Manual (back-dated) registration. `today` is the Kyiv calendar date "YYYY-MM-DD":
 * the server passes its own (authoritative), the browser its own for instant hints.
 * `allowOtherWithoutWording`: the edit form of a record migrated to OTHER without wording,
 * which stays editable until someone touches its category (the server applies the same rule).
 */
export function manualApplicationSchema(
  today: string,
  { allowOtherWithoutWording = false }: { allowOtherWithoutWording?: boolean } = {},
) {
  return applicationFields
    .extend({
      regDate: regDateField.refine(
        (date) => date <= today,
        'Дата реєстрації не може бути пізнішою за сьогодні',
      ),
      regSeq: regSeqField,
    })
    .strict()
    .superRefine((data, ctx) => {
      if (!allowOtherWithoutWording) requireOtherWording(data, ctx);
    });
}

export type ManualApplicationInput = z.input<ReturnType<typeof manualApplicationSchema>>;
export type ManualApplicationData = z.output<ReturnType<typeof manualApplicationSchema>>;

const objectIdField = z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор');

/** Query for checking a manual number before saving; `excludeId` = the application being edited. */
export const manualNumberCheckSchema = z.object({
  regDate: regDateField,
  regSeq: regSeqField,
  excludeId: z.preprocess((v) => (v === '' ? undefined : v), objectIdField.optional()),
  /** Admins only (moving an application to another department); users check their own. */
  department: z.preprocess((v) => (v === '' ? undefined : v), departmentField.optional()),
});

/** Is "14т/24" free? `takenOn` is the registration date of the application holding it. */
export type ManualNumberCheckDto = {
  regNumber: string;
  available: boolean;
  takenOn: string | null;
};

/** Application as returned by the API. `regDate` is a calendar date "YYYY-MM-DD". */
export type ApplicationDto = {
  id: string;
  regNumber: string;
  regYear: number;
  regSeq: number;
  regDate: string;
  /** The author's department at registration; only an admin can change it. */
  department: Department;
  customer: string;
  customerRepresentative: string | null;
  phone: string;
  email: string | null;
  /** Null only for records from before the field whose address could not be split. */
  settlement: string | null;
  objectAddress: string;
  /** Null only for records from before the field whose settlement gave no clue. */
  areaType: AreaType | null;
  /** Null only for records from before the field (2026-11-18). */
  gasificationType: GasificationType | null;
  objectType: ObjectType;
  objectCategory: ObjectCategory;
  /** Personal account (domestic) or contract number (non-domestic); reconstruction only. */
  accountNumber: string | null;
  /** The user's wording for OTHER; null for any other category (and for migrated records). */
  objectCategoryOther: string | null;
  comment: string | null;
  registrationMode: RegistrationMode;
  status: ApplicationStatus;
  createdBy: { id: string; fullName: string };
  annulment: { reason: string; at: string; by: { id: string; fullName: string } } | null;
  /** The scanned documents (PDF), if any. */
  scan: ScanDto | null;
  createdAt: string;
  updatedAt: string;
  /** Where the processing stands, derived from the responses and technical conditions. */
  stage: ProcessingStage;
  /** False for applications registered before deadlines were tracked: no overdue warnings. */
  deadlinesTracked: boolean;
  version: number;
};

/** Admins may ask for the hint of the department they are registering into. */
export const nextNumberQuerySchema = z.object({
  department: z.preprocess((v) => (v === '' ? undefined : v), departmentField.optional()),
});

/** A hint for the form; the number is not reserved. */
export type NextNumberDto = { regNumber: string; regYear: number; regSeq: number; regDate: string };

// ── Editing ───────────────────────────────────────────────────────────────────

/** Optimistic concurrency: the version the client saw; a newer one means someone else edited. */
const versionField = z.number('Відсутня версія заяви').int().min(1);

/** In an update, "" means "clear this optional field" (null), while omitting it means "unchanged". */
const clearableText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}: не більше ${max} символів`)
    .transform((value) => (value === '' ? null : value));

const clearableEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email: не більше 254 символів')
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Невірний email')
  .transform((value) => (value === '' ? null : value));

/**
 * Partial update: only the fields that changed. Registration date and number are optional too;
 * the year of the number always follows the (new or current) registration date.
 */
export function updateApplicationSchema(today: string) {
  return z
    .object({
      customer: applicationFields.shape.customer.optional(),
      customerRepresentative: clearableText('Представник замовника', 300).optional(),
      phone: phoneField.optional(),
      email: clearableEmail.optional(),
      settlement: applicationFields.shape.settlement.optional(),
      objectAddress: applicationFields.shape.objectAddress.optional(),
      areaType: applicationFields.shape.areaType.optional(),
      gasificationType: applicationFields.shape.gasificationType.optional(),
      objectType: applicationFields.shape.objectType.optional(),
      // Whether OTHER has its wording is checked by the server against the stored value
      // when only one of the two is sent.
      objectCategory: objectCategoryField.optional(),
      accountNumber: clearableText('Особовий рахунок / № договору', ACCOUNT_NUMBER_MAX).optional(),
      objectCategoryOther: clearableText('Категорія', OBJECT_CATEGORY_OTHER_MAX).optional(),
      comment: clearableText('Коментар', COMMENT_MAX).optional(),
      regDate: regDateField
        .refine((date) => date <= today, 'Дата реєстрації не може бути пізнішою за сьогодні')
        .optional(),
      regSeq: regSeqField.optional(),
      // Admins only: moves the application (and its number) to another department.
      department: departmentField.optional(),
      version: versionField,
    })
    .strict()
    .refine(
      (data) => Object.keys(data).some((key) => key !== 'version'),
      'Немає змін для збереження',
    )
    .superRefine((data, ctx) => {
      if (data.objectCategoryOther !== undefined) requireOtherWording(data, ctx);
    });
}

export type UpdateApplicationInput = z.input<ReturnType<typeof updateApplicationSchema>>;
export type UpdateApplicationData = z.output<ReturnType<typeof updateApplicationSchema>>;

export const ANNUL_REASON_MIN = 3;

export const annulApplicationSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(ANNUL_REASON_MIN, 'Вкажіть причину анулювання')
      .max(500, 'Причина: не більше 500 символів'),
    version: versionField,
  })
  .strict();

export const restoreApplicationSchema = z.object({ version: versionField }).strict();

/** Deletion is irreversible; the version guards against deleting what someone just changed. */
export const deleteApplicationQuerySchema = z.object({
  version: z.coerce.number('Відсутня версія заяви').int().min(1),
});

export const OBJECT_CATEGORY_OTHER_REQUIRED = otherRequired;

export type AnnulApplicationInput = z.infer<typeof annulApplicationSchema>;

/** One saved change of an application: who, when, and each field's old → new value. */
export type ApplicationChangeDto = {
  id: string;
  action: ApplicationChangeAction;
  changedAt: string;
  changedBy: { id: string; fullName: string };
  changes: { field: string; oldValue: unknown; newValue: unknown }[];
};
