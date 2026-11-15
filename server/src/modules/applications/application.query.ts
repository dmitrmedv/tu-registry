import {
  type ApplicationListQueryData,
  type ApplicationSort,
  AREA_TYPE_LABELS,
  codesByLabel,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
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

/**
 * Translates a validated list query into a MongoDB filter. Values are already cast (ObjectId,
 * Date), so the same filter works in find() and in an aggregation, which does not cast.
 */
/**
 * `numberDepartment`: the department whose code a "15т/26-8" search names (looked up by the
 * caller); null when no department has that code, so nothing matches.
 */
export function buildListFilter(query: ApplicationListQueryData, numberDepartment?: string | null) {
  const filter: Record<string, unknown> = {};
  for (const [param, field] of TEXT_SEARCHES) {
    const text = query[param];
    if (text) filter[field] = contains(text);
  }
  if (query.department) filter.department = query.department;
  if (query.number) {
    filter.regSeq = query.number.seq;
    if ('year' in query.number) filter.regYear = query.number.year;
    // "15т/26-8" names a department; for a user it must also be their own (another
    // department's number then simply finds nothing).
    if (numberDepartment !== undefined) {
      filter.department =
        numberDepartment === null || (query.department && query.department !== numberDepartment)
          ? mongoose.trusted({ $in: [] })
          : numberDepartment;
    }
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
