import {
  type ApplicationListQueryData,
  type ApplicationSort,
  AREA_TYPE_LABELS,
  GASIFICATION_TYPE_LABELS,
  codesByLabel,
  CONNECTION_TYPE_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  parseRegNumberSearch,
  type RegNumberSearch,
  REGISTRY_STAGE_LABELS,
  type SortField,
} from '@tu-registry/shared';
import mongoose from 'mongoose';
import { fromIsoDate } from '../../utils/kyivDate';

/** User text is matched literally: "ТОВ (Приклад)" must not become a regex group. */
function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive substring match. Trusted: built by us from validated, escaped input. */
function contains(text: string) {
  return mongoose.trusted({ $regex: escapeRegex(text), $options: 'i' });
}

/** The single search box looks in these fields (and at the number, when it reads as one). */
const QUICK_SEARCH_FIELDS = [
  'customer',
  'customerRepresentative',
  'accountNumber',
  'settlement',
  'objectAddress',
  'comment',
  // Numbers of the responses and the valid technical conditions (stage 17.6).
  'processing.documentNumbers',
] as const;

/** The search box read as a registration number, if it is one. */
export function searchedNumber(query: ApplicationListQueryData) {
  return query.q ? parseRegNumberSearch(query.q) : null;
}

/**
 * Conditions for a number search. "15т/26-8" names a department (`numberDepartment`, looked up
 * by the caller; null when no department has that code). For a user it must also be their own:
 * another department's number then simply finds nothing.
 */
function numberConditions(
  number: RegNumberSearch,
  numberDepartment: string | null | undefined,
  scope: string | undefined,
) {
  const conditions: Record<string, unknown> = { regSeq: number.seq };
  if (number.year !== undefined) conditions.regYear = number.year;
  if (number.departmentCode !== undefined) {
    conditions.department =
      !numberDepartment || (scope && scope !== numberDepartment)
        ? mongoose.trusted({ $in: [] })
        : numberDepartment;
  }
  return conditions;
}

/**
 * Translates a validated list query into a MongoDB filter. Values are already cast (ObjectId,
 * Date), so the same filter works in find() and in an aggregation, which does not cast.
 */
export function buildListFilter(query: ApplicationListQueryData, numberDepartment?: string | null) {
  const filter: Record<string, unknown> = {};
  if (query.department) filter.department = query.department;
  if (query.q) {
    const text = contains(query.q);
    const anyOf: Record<string, unknown>[] = QUICK_SEARCH_FIELDS.map((field) => ({
      [field]: text,
    }));
    // "15" is both number 15 and "вул. Шевченка, 15": either matches.
    const number = searchedNumber(query);
    if (number) anyOf.push(numberConditions(number, numberDepartment, query.department));
    filter.$or = anyOf;
  }
  if (query.objectType) filter.objectType = query.objectType;
  if (query.objectCategory) filter.objectCategory = query.objectCategory;
  if (query.areaType) filter.areaType = query.areaType;
  if (query.gasificationType) filter.gasificationType = query.gasificationType;
  if (query.stage === 'ANNULLED') filter.status = 'ANNULLED';
  else if (query.stage) {
    filter.status = 'ACTIVE';
    // An application without a summary yet (before `db:migrate`) has no documents: registered.
    filter['processing.stage'] =
      query.stage === 'REGISTERED' ? mongoose.trusted({ $in: ['REGISTERED', null] }) : query.stage;
  }
  if (query.engineer) {
    filter['processing.engineerIds'] = new mongoose.Types.ObjectId(query.engineer);
  }
  if (query.createdBy) filter.createdBy = new mongoose.Types.ObjectId(query.createdBy);
  if (query.dateFrom || query.dateTo) {
    // Both ends inclusive: registration dates are stored as midnight UTC.
    filter.regDate = mongoose.trusted({
      ...(query.dateFrom && { $gte: fromIsoDate(query.dateFrom) }),
      ...(query.dateTo && { $lte: fromIsoDate(query.dateTo) }),
    });
  }
  return filter;
}

/** Ukrainian alphabetical order for text; the matching indexes are built with it too. */
export const UKRAINIAN = { locale: 'uk' } as const;

export type ListSort =
  /** Sorted by the database through an index. */
  | { kind: 'indexed'; sort: Record<string, 1 | -1>; collation?: typeof UKRAINIAN }
  /** Sorted by a computed key (an enum's name, the author's name) after filtering. */
  | { kind: 'computed'; field: ComputedSortField; dir: 1 | -1 };

/** Sorted after filtering, in the database's memory (no index): see §5.7 of ARCHITECTURE. */
export type ComputedSortField = Exclude<
  SortField,
  'regNumber' | 'regDate' | TextSortField | DateSortField
>;
type TextSortField = (typeof TEXT_SORT_FIELDS)[number];
type DateSortField = keyof typeof DATE_SORT_PATHS;

/** Dates of documents, sorted through indexes like the registration date. */
const DATE_SORT_PATHS = {
  lastResponseDate: 'processing.lastResponseDate',
  tuDate: 'processing.tuDate',
} as const;

const TEXT_SORT_FIELDS = [
  'customer',
  'settlement',
  'objectAddress',
  'customerRepresentative',
  'accountNumber',
] as const;

/** Equal values are always ordered by number, in the same direction, so pages are stable. */
export function listSort(sort: ApplicationSort): ListSort {
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '') as SortField;
  const byNumber = { regYear: dir, regSeq: dir } as const;
  if (field === 'regNumber') return { kind: 'indexed', sort: byNumber };
  if (field === 'regDate') return { kind: 'indexed', sort: { regDate: dir, ...byNumber } };
  if (field in DATE_SORT_PATHS) {
    const path = DATE_SORT_PATHS[field as DateSortField];
    return { kind: 'indexed', sort: { [path]: dir, ...byNumber } };
  }
  if ((TEXT_SORT_FIELDS as readonly string[]).includes(field)) {
    return { kind: 'indexed', sort: { [field]: dir, ...byNumber }, collation: UKRAINIAN };
  }
  return { kind: 'computed', field: field as ComputedSortField, dir };
}

/** Enum codes in the alphabetical order of their names: the position is the sort key. */
export const CODES_BY_NAME = {
  objectType: codesByLabel(OBJECT_TYPE_LABELS),
  objectCategory: codesByLabel(OBJECT_CATEGORY_LABELS),
  areaType: codesByLabel(AREA_TYPE_LABELS),
  gasificationType: codesByLabel(GASIFICATION_TYPE_LABELS),
  connectionType: codesByLabel(CONNECTION_TYPE_LABELS),
  stage: codesByLabel(REGISTRY_STAGE_LABELS),
};
