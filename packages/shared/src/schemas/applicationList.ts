import { z } from 'zod';
import { APPLICATION_STATUSES, AREA_TYPES, OBJECT_CATEGORIES, OBJECT_TYPES } from '../enums';
import { departmentField } from '../departments';
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

export const applicationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(10).max(100).default(20),
    sort: z.preprocess(emptyToUndefined, z.enum(APPLICATION_SORTS).default('-regDate')),
    /**
     * One search box: a substring of the customer, representative, settlement, address or
     * comment, or a registration number (see parseRegNumberSearch).
     */
    q: searchText,
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
