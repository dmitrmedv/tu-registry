import { z } from 'zod';
import { APPLICATION_STATUSES, AREA_TYPES, OBJECT_CATEGORIES, OBJECT_TYPES } from '../enums';
import { parseRegNumber } from '../regNumber';
import { departmentField } from './user';
import type { ApplicationDto } from './application';

/** Every registry column can be sorted; "-field" is descending. */
export const SORT_FIELDS = [
  'regNumber',
  'regDate',
  'department',
  'customer',
  'settlement',
  'areaType',
  'objectAddress',
  'objectType',
  'objectCategory',
  'customerRepresentative',
  'createdBy',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const APPLICATION_SORTS = SORT_FIELDS.flatMap((field) => [field, `-${field}`] as const);
export type ApplicationSort = SortField | `-${SortField}`;

export const PAGE_SIZES = [20, 50, 100] as const;

/** Query strings arrive as "" for empty inputs; treat that as "not set". */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const searchText = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(200, 'Не більше 200 символів').optional(),
);

/**
 * Number search: "15т/26-8" finds that exact number, "15т/26" — number 15 of 2026 in any
 * department, "15" — number 15 in any year.
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
        ctx.addIssue({ code: 'custom', message: 'Номер: 15, 15т/26 або 15т/26-8' });
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
    settlement: searchText,
    address: searchText,
    customerRepresentative: searchText,
    comment: searchText,
    number: regNumberSearchField,
    /** Admins choose; for users the server always uses their own department. */
    department: z.preprocess(emptyToUndefined, departmentField.optional()),
    objectType: z.preprocess(emptyToUndefined, z.enum(OBJECT_TYPES).optional()),
    objectCategory: z.preprocess(emptyToUndefined, z.enum(OBJECT_CATEGORIES).optional()),
    areaType: z.preprocess(emptyToUndefined, z.enum(AREA_TYPES).optional()),
    status: z.preprocess(emptyToUndefined, z.enum(APPLICATION_STATUSES).optional()),
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
  | 'department'
  | 'customer'
  | 'customerRepresentative'
  | 'settlement'
  | 'objectAddress'
  | 'areaType'
  | 'objectType'
  | 'objectCategory'
  | 'objectCategoryOther'
  | 'registrationMode'
  | 'status'
  | 'createdBy'
>;

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PageMeta };

/** For the "registered by" filter; includes deactivated users, whose applications remain. */
export type UserOptionDto = { id: string; fullName: string; isActive: boolean };
