import type { ApplicationListQueryData, ApplicationSort } from '@tu-registry/shared';
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

/** Translates a validated list query into a MongoDB filter. */
export function buildListFilter(query: ApplicationListQueryData) {
  const filter: Record<string, unknown> = {};
  if (query.customer) filter.customer = contains(query.customer);
  if (query.address) filter.objectAddress = contains(query.address);
  if (query.number) {
    filter.regSeq = query.number.seq;
    if ('year' in query.number) filter.regYear = query.number.year;
  }
  if (query.objectType) filter.objectType = query.objectType;
  if (query.status) filter.status = query.status;
  if (query.createdBy) filter.createdBy = query.createdBy;
  if (query.dateFrom || query.dateTo) {
    // Both ends inclusive: registration dates are stored as midnight UTC.
    filter.regDate = mongoose.trusted({
      ...(query.dateFrom && { $gte: fromIsoDate(query.dateFrom) }),
      ...(query.dateTo && { $lte: fromIsoDate(query.dateTo) }),
    });
  }
  return filter;
}

/** Numbers sort numerically (year, then sequence); dates break ties by number. */
export const LIST_SORTS: Record<ApplicationSort, Record<string, 1 | -1>> = {
  '-regDate': { regDate: -1, regYear: -1, regSeq: -1 },
  regDate: { regDate: 1, regYear: 1, regSeq: 1 },
  '-regNumber': { regYear: -1, regSeq: -1 },
  regNumber: { regYear: 1, regSeq: 1 },
};
