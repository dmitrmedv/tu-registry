import {
  type ApplicationListQueryData,
  type ApplicationSort,
  AREA_TYPE_LABELS,
  codesByLabel,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  parseRegNumberSearch,
  type RegNumberSearch,
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

const TEXT_SEARCHES = [
  ['customer', 'customer'],
  ['settlement', 'settlement'],
  ['address', 'objectAddress'],
  ['customerRepresentative', 'customerRepresentative'],
  ['comment', 'comment'],
] as const;

/** The single search box looks in these fields (and at the number, when it reads as one). */
const QUICK_SEARCH_FIELDS = [
  'customer',
  'customerRepresentative',
  'settlement',
  'objectAddress',
  'comment',
] as const;

/**
 * Departments named by the codes in a number search ("15т/26-8" → code 8): code → id, or null
 * when no department has that code. Looked up by the caller, which reads the directory.
 */
export type NumberDepartments = ReadonlyMap<number, string | null>;

/** The codes a list query names in its number searches, for the caller to look up. */
export function searchedDepartmentCodes(query: ApplicationListQueryData) {
  const numbers = [query.number, query.q ? parseRegNumberSearch(query.q) : null];
  return numbers.flatMap((n) => (n?.departmentCode === undefined ? [] : [n.departmentCode]));
}

/**
 * Conditions for one number search. "15т/26-8" names a department; for a user it must also be
 * their own (another department's number then simply finds nothing).
 */
function numberConditions(
  number: RegNumberSearch,
  departments: NumberDepartments,
  scope: string | undefined,
) {
  const conditions: Record<string, unknown> = { regSeq: number.seq };
  if (number.year !== undefined) conditions.regYear = number.year;
  if (number.departmentCode !== undefined) {
    const named = departments.get(number.departmentCode) ?? null;
    conditions.department =
      named === null || (scope && scope !== named) ? mongoose.trusted({ $in: [] }) : named;
  }
  return conditions;
}

/**
 * Translates a validated list query into a MongoDB filter. Values are already cast (ObjectId,
 * Date), so the same filter works in find() and in an aggregation, which does not cast.
 */
export function buildListFilter(
  query: ApplicationListQueryData,
  departments: NumberDepartments = new Map(),
) {
  const filter: Record<string, unknown> = {};
  for (const [param, field] of TEXT_SEARCHES) {
    const text = query[param];
    if (text) filter[field] = contains(text);
  }
  if (query.department) filter.department = query.department;
  if (query.number)
    Object.assign(filter, numberConditions(query.number, departments, query.department));
  if (query.q) {
    const text = contains(query.q);
    const anyOf: Record<string, unknown>[] = QUICK_SEARCH_FIELDS.map((field) => ({
      [field]: text,
    }));
    // "15" is both number 15 and "вул. Шевченка, 15": either matches.
    const number = parseRegNumberSearch(query.q);
    if (number) anyOf.push(numberConditions(number, departments, query.department));
    filter.$or = anyOf;
  }
  if (query.objectType) filter.objectType = query.objectType;
  if (query.objectCategory) filter.objectCategory = query.objectCategory;
  if (query.areaType) filter.areaType = query.areaType;
  if (query.status) filter.status = query.status;
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
  | {
      kind: 'computed';
      field: 'department' | 'objectType' | 'objectCategory' | 'areaType' | 'createdBy';
      dir: 1 | -1;
    };

const TEXT_SORT_FIELDS = ['customer', 'settlement', 'objectAddress', 'customerRepresentative'];

/** Equal values are always ordered by number, in the same direction, so pages are stable. */
export function listSort(sort: ApplicationSort): ListSort {
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '') as SortField;
  const byNumber = { regYear: dir, regSeq: dir } as const;
  if (field === 'regNumber') return { kind: 'indexed', sort: byNumber };
  if (field === 'regDate') return { kind: 'indexed', sort: { regDate: dir, ...byNumber } };
  if (TEXT_SORT_FIELDS.includes(field)) {
    return { kind: 'indexed', sort: { [field]: dir, ...byNumber }, collation: UKRAINIAN };
  }
  return {
    kind: 'computed',
    field: field as Extract<ListSort, { kind: 'computed' }>['field'],
    dir,
  };
}

/** Enum codes in the alphabetical order of their names: the position is the sort key. */
export const CODES_BY_NAME = {
  objectType: codesByLabel(OBJECT_TYPE_LABELS),
  objectCategory: codesByLabel(OBJECT_CATEGORY_LABELS),
  areaType: codesByLabel(AREA_TYPE_LABELS),
};
