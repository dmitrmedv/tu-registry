import { z } from 'zod';
import { OBJECT_TYPES } from '../enums';
import { parseRegNumber } from '../regNumber';
import type { ApplicationDto } from './application';

export const APPLICATION_SORTS = ['-regDate', 'regDate', '-regNumber', 'regNumber'] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export const PAGE_SIZES = [20, 50, 100] as const;

/** Query strings arrive as "" for empty inputs; treat that as "not set". */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const searchText = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(200, 'Не більше 200 символів').optional(),
);

/**
 * Number search: "15т/26" finds that exact number, "15" finds number 15 in any year.
 * Shared so the browser can flag a bad value before asking the server.
 */
export const regNumberSearchField = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(20)
    .transform((value, ctx) => {
      if (/^\d+$/.test(value) && Number(value) > 0) return { seq: Number(value) };
      const parsed = parseRegNumber(value);
      if (!parsed) {
        ctx.addIssue({ code: 'custom', message: 'Номер: 15 або 15т/26' });
        return z.NEVER;
      }
      return parsed;
    })
    .optional(),
);

export const applicationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(10).max(100).default(20),
    sort: z.preprocess(emptyToUndefined, z.enum(APPLICATION_SORTS).default('-regDate')),
    customer: searchText,
    address: searchText,
    number: regNumberSearchField,
    objectType: z.preprocess(emptyToUndefined, z.enum(OBJECT_TYPES).optional()),
    createdBy: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-f\d]{24}$/i, 'Некоректний користувач')
        .optional(),
    ),
    dateFrom: z.preprocess(emptyToUndefined, z.iso.date('Некоректна дата').optional()),
    dateTo: z.preprocess(emptyToUndefined, z.iso.date('Некоректна дата').optional()),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    path: ['dateTo'],
    message: 'Кінець періоду раніше за початок',
  });

export type ApplicationListQuery = z.input<typeof applicationListQuerySchema>;
export type ApplicationListQueryData = z.output<typeof applicationListQuerySchema>;

/** A registry row: the application without contact details. */
export type ApplicationListItemDto = Pick<
  ApplicationDto,
  | 'id'
  | 'regNumber'
  | 'regYear'
  | 'regSeq'
  | 'regDate'
  | 'customer'
  | 'customerRepresentative'
  | 'objectAddress'
  | 'objectType'
  | 'registrationMode'
  | 'status'
  | 'createdBy'
>;

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PageMeta };

/** For the "registered by" filter; includes deactivated users, whose applications remain. */
export type UserOptionDto = { id: string; fullName: string; isActive: boolean };
