import {
  type ApplicationListItemDto,
  type ApplicationListQueryData,
  type Department,
  formatRegNumber,
  type Paginated,
} from '@tu-registry/shared';
import type mongoose from 'mongoose';
import { toIsoDate } from '../../utils/kyivDate';
import {
  buildListFilter,
  CODES_BY_NAME,
  type ListSort,
  listSort,
  UKRAINIAN,
} from './application.query';
import { Application } from './application.model';

type ListedApplication = {
  _id: mongoose.Types.ObjectId;
  regYear: number;
  regSeq: number;
  regDate: Date;
  department: Department;
  customer: string;
  customerRepresentative?: string;
  settlement?: string;
  objectAddress: string;
  areaType?: ApplicationListItemDto['areaType'];
  objectType: ApplicationListItemDto['objectType'];
  objectCategory: ApplicationListItemDto['objectCategory'];
  objectCategoryOther?: string;
  registrationMode: ApplicationListItemDto['registrationMode'];
  status: ApplicationListItemDto['status'];
  createdBy: { _id: mongoose.Types.ObjectId; fullName: string } | null;
};

const LIST_FIELDS = [
  'regYear',
  'regSeq',
  'regDate',
  'department',
  'customer',
  'customerRepresentative',
  'settlement',
  'objectAddress',
  'areaType',
  'objectType',
  'objectCategory',
  'objectCategoryOther',
  'registrationMode',
  'status',
  'createdBy',
] as const;

type Page = { filter: Record<string, unknown>; skip: number; limit: number };

function findIndexed({ filter, skip, limit }: Page, sort: Extract<ListSort, { kind: 'indexed' }>) {
  const query = Application.find(filter).sort(sort.sort).skip(skip).limit(limit);
  if (sort.collation) query.collation(sort.collation);
  return query
    .select(LIST_FIELDS.join(' '))
    .populate('createdBy', 'fullName')
    .lean<ListedApplication[]>();
}

/**
 * Sorting by a name that is not stored (an enum value's name, the author's name) happens after
 * filtering, in the database's memory: no index can serve it. Acceptable for this registry's
 * size; see docs/ARCHITECTURE.md (stage 12).
 */
async function findComputed(
  { filter, skip, limit }: Page,
  { field, dir }: Extract<ListSort, { kind: 'computed' }>,
) {
  const sortKey =
    field === 'createdBy'
      ? [
          {
            $lookup: {
              from: 'users',
              localField: 'createdBy',
              foreignField: '_id',
              pipeline: [{ $project: { fullName: 1 } }],
              as: 'author',
            },
          },
          { $addFields: { sortKey: { $first: '$author.fullName' } } },
        ]
      : [{ $addFields: { sortKey: { $indexOfArray: [CODES_BY_NAME[field], `$${field}`] } } }];
  const rows = await Application.aggregate<ListedApplication>(
    [
      { $match: filter },
      ...sortKey,
      { $sort: { sortKey: dir, regYear: dir, regSeq: dir } },
      { $skip: skip },
      { $limit: limit },
      { $project: Object.fromEntries(LIST_FIELDS.map((key) => [key, 1])) },
    ],
    { collation: UKRAINIAN },
  );
  // populate() types its result as the model's document; these rows keep their own shape.
  const populated: unknown = await Application.populate(rows, {
    path: 'createdBy',
    select: 'fullName',
  });
  return populated as ListedApplication[];
}

/** One page of the registry. Filtering, sorting and paging happen in the database. */
export async function listApplications(
  query: ApplicationListQueryData,
): Promise<Paginated<ApplicationListItemDto>> {
  const page = {
    filter: buildListFilter(query),
    skip: (query.page - 1) * query.limit,
    limit: query.limit,
  };
  const sort = listSort(query.sort);
  const [rows, total] = await Promise.all([
    sort.kind === 'indexed' ? findIndexed(page, sort) : findComputed(page, sort),
    Application.countDocuments(page.filter),
  ]);

  return {
    data: rows.map((row) => ({
      id: String(row._id),
      regNumber: formatRegNumber(row.regYear, row.regSeq, row.department),
      regYear: row.regYear,
      regSeq: row.regSeq,
      regDate: toIsoDate(row.regDate),
      department: row.department,
      customer: row.customer,
      customerRepresentative: row.customerRepresentative ?? null,
      settlement: row.settlement ?? null,
      objectAddress: row.objectAddress,
      areaType: row.areaType ?? null,
      objectType: row.objectType,
      objectCategory: row.objectCategory,
      objectCategoryOther: row.objectCategoryOther ?? null,
      registrationMode: row.registrationMode,
      status: row.status,
      createdBy: row.createdBy
        ? { id: String(row.createdBy._id), fullName: row.createdBy.fullName }
        : { id: '', fullName: '—' },
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
