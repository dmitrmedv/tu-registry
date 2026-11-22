import { z } from 'zod';
import {
  AREA_TYPES,
  type ConnectionType,
  GASIFICATION_TYPES,
  OBJECT_CATEGORIES,
  OBJECT_TYPES,
  PROCESSING_STAGES,
} from '../enums';
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
  'gasificationType',
  'objectAddress',
  'objectType',
  'objectCategory',
  'customerRepresentative',
  'accountNumber',
  'createdBy',
  // Stage 17.6: the processing summary.
  'stage',
  'lastResponseDate',
  'lastResponseNumber',
  'tuDate',
  'tuNumber',
  // The last contract not cancelled (2026-11-22).
  'contractNumber',
  'gasFlow',
  'connectionType',
  'engineer',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const APPLICATION_SORTS = SORT_FIELDS.flatMap((field) => [field, `-${field}`] as const);
export type ApplicationSort = SortField | `-${SortField}`;

export const PAGE_SIZES = [20, 50, 100] as const;

/** The registry's «Стан» filter: a processing stage of an active application, or annulled. */
export const STAGE_FILTERS = [...PROCESSING_STAGES, 'ANNULLED'] as const;
export type StageFilter = (typeof STAGE_FILTERS)[number];

const objectId = (message: string) => z.string().regex(/^[a-f\d]{24}$/i, message);

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
    gasificationType: z.preprocess(emptyToUndefined, z.enum(GASIFICATION_TYPES).optional()),
    stage: z.preprocess(emptyToUndefined, z.enum(STAGE_FILTERS).optional()),
    createdBy: z.preprocess(emptyToUndefined, objectId('Некоректний користувач').optional()),
    /** An engineer named in any document in force (a response or the valid TU). */
    engineer: z.preprocess(emptyToUndefined, objectId('Некоректний інженер').optional()),
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
  | 'accountNumber'
  | 'settlement'
  | 'objectAddress'
  | 'areaType'
  | 'gasificationType'
  | 'objectType'
  | 'objectCategory'
  | 'objectCategoryOther'
  | 'registrationMode'
  | 'status'
  | 'createdBy'
  | 'stage'
> & {
  // From the processing summary (stage 17.5); null while there is no such document.
  lastResponseDate: string | null;
  lastResponseNumber: string | null;
  tuDate: string | null;
  tuNumber: string | null;
  contractNumber: string | null;
  gasFlow: number | null;
  connectionType: ConnectionType | null;
  engineerName: string | null;
};

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PageMeta };

/** For the "registered by" filter; includes deactivated users, whose applications remain. */
export type UserOptionDto = { id: string; fullName: string; isActive: boolean };
