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
    customerRepresentative: requiredText('Представник замовника', 300),
    phone: phoneField,
    email: emailField,
    objectAddress: requiredText('Адреса обʼєкта', 500),
    objectType: z.enum(OBJECT_TYPES, { error: 'Оберіть тип обʼєкта' }),
  })
  .strict();

export type CreateApplicationInput = z.input<typeof createApplicationSchema>;
export type CreateApplicationData = z.output<typeof createApplicationSchema>;

/** Application as returned by the API. `regDate` is a calendar date "YYYY-MM-DD". */
export type ApplicationDto = {
  id: string;
  regNumber: string;
  regYear: number;
  regSeq: number;
  regDate: string;
  customer: string;
  customerRepresentative: string;
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
