import { z } from 'zod';
import {
  type ApplicationStatus,
  OBJECT_TYPES,
  type ObjectType,
  type RegistrationMode,
} from '../enums';
import { normalizePhone } from '../phone';

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

export const createApplicationSchema = z
  .object({
    customer: requiredText('Замовник', 300),
    customerRepresentative: optionalText('Представник замовника', 300),
    phone: phoneField,
    email: emailField,
    objectAddress: requiredText('Адреса обʼєкта', 500),
    objectType: z.enum(OBJECT_TYPES, { error: 'Оберіть тип обʼєкта' }),
  })
  .strict();

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
 */
export function manualApplicationSchema(today: string) {
  return createApplicationSchema
    .extend({
      regDate: regDateField.refine(
        (date) => date <= today,
        'Дата реєстрації не може бути пізнішою за сьогодні',
      ),
      regSeq: regSeqField,
    })
    .strict();
}

export type ManualApplicationInput = z.input<ReturnType<typeof manualApplicationSchema>>;
export type ManualApplicationData = z.output<ReturnType<typeof manualApplicationSchema>>;

/** Query for checking a manual number before saving. */
export const manualNumberCheckSchema = z.object({ regDate: regDateField, regSeq: regSeqField });

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
  customer: string;
  customerRepresentative: string | null;
  phone: string;
  email: string | null;
  objectAddress: string;
  objectType: ObjectType;
  registrationMode: RegistrationMode;
  status: ApplicationStatus;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
  version: number;
};

/** A hint for the form; the number is not reserved. */
export type NextNumberDto = { regNumber: string; regYear: number; regSeq: number; regDate: string };
