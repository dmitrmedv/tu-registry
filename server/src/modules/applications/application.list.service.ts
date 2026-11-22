import {
  type ApplicationListItemDto,
  type ApplicationListQueryData,
  codesByLabel,
  type Department,
  formatRegNumber,
  type Paginated,
} from '@tu-registry/shared';
import type mongoose from 'mongoose';
import { toIsoDate } from '../../utils/kyivDate';
import { departmentDirectory } from '../departments/department.service';
import {
  buildListFilter,
  searchedNumber,
  CODES_BY_NAME,
  type ComputedSortField,
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
  accountNumber?: string;
  settlement?: string;
  objectAddress: string;
  areaType?: ApplicationListItemDto['areaType'];
  gasificationType?: ApplicationListItemDto['gasificationType'];
  objectType: ApplicationListItemDto['objectType'];
  objectCategory: ApplicationListItemDto['objectCategory'];
  objectCategoryOther?: string;
  registrationMode: ApplicationListItemDto['registrationMode'];
  status: ApplicationListItemDto['status'];
  createdBy: { _id: mongoose.Types.ObjectId; fullName: string } | null;
  processing?: {
    stage: ApplicationListItemDto['stage'];
    lastResponseDate?: Date;
    lastResponseNumber?: string;
    tuDate?: Date;
    tuNumber?: string;
    contractNumber?: string;
    gasFlow?: number;
    connectionType?: ApplicationListItemDto['connectionType'];
    engineerName?: string;
  };
};

const LIST_FIELDS = [
  'regYear',
  'regSeq',
  'regDate',
  'department',
  'customer',
  'customerRepresentative',
  'accountNumber',
  'settlement',
  'objectAddress',
  'areaType',
  'gasificationType',
  'objectType',
  'objectCategory',
  'objectCategoryOther',
  'registrationMode',
  'status',
  'createdBy',
  'processing',
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
  const rows = await Application.aggregate<ListedApplication>(
    [
      { $match: filter },
      ...(await sortKeyStages(field)),
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

/** Stored values of the processing summary, sorted as they are (text by Ukrainian collation). */
const STORED_KEYS = {
  lastResponseNumber: '$processing.lastResponseNumber',
  tuNumber: '$processing.tuNumber',
  contractNumber: '$processing.contractNumber',
  gasFlow: '$processing.gasFlow',
  engineer: '$processing.engineerName',
} as const;

/** Values sorted by the alphabetical order of their names: the position is the key. */
const ENUM_KEYS = {
  objectType: '$objectType',
  objectCategory: '$objectCategory',
  areaType: '$areaType',
  gasificationType: '$gasificationType',
  connectionType: '$processing.connectionType',
  // As the registry shows it: annulled, else the stage (none yet: registered).
  stage: {
    $cond: [
      { $eq: ['$status', 'ANNULLED'] },
      'ANNULLED',
      { $ifNull: ['$processing.stage', 'REGISTERED'] },
    ],
  },
} as const;

/** The stages that put `sortKey` on each row for `field`. */
async function sortKeyStages(field: ComputedSortField) {
  if (field === 'createdBy') {
    return [
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
    ];
  }
  if (field in STORED_KEYS) {
    return [{ $addFields: { sortKey: STORED_KEYS[field as keyof typeof STORED_KEYS] } }];
  }
  if (field === 'department') {
    // Departments live in the database: their names are read now.
    const departments = [...(await departmentDirectory()).values()];
    const codes = codesByLabel(Object.fromEntries(departments.map((d) => [d.id, d.name])));
    return [{ $addFields: { sortKey: { $indexOfArray: [codes, '$department'] } } }];
  }
  const enumField = field as keyof typeof ENUM_KEYS;
  return [
    {
      $addFields: {
        sortKey: { $indexOfArray: [CODES_BY_NAME[enumField], ENUM_KEYS[enumField]] },
      },
    },
  ];
}

/** One page of the registry. Filtering, sorting and paging happen in the database. */
export async function listApplications(
  query: ApplicationListQueryData,
): Promise<Paginated<ApplicationListItemDto>> {
  const departments = await departmentDirectory();
  const searchedCode = searchedNumber(query)?.departmentCode;
  const numberDepartment =
    searchedCode === undefined
      ? undefined
      : ([...departments.values()].find((d) => d.code === searchedCode)?.id ?? null);
  const page = {
    filter: buildListFilter(query, numberDepartment),
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
      regNumber: formatRegNumber(
        row.regYear,
        row.regSeq,
        departments.get(row.department)?.code ?? 0,
      ),
      regYear: row.regYear,
      regSeq: row.regSeq,
      regDate: toIsoDate(row.regDate),
      department: row.department,
      customer: row.customer,
      customerRepresentative: row.customerRepresentative ?? null,
      accountNumber: row.accountNumber ?? null,
      settlement: row.settlement ?? null,
      objectAddress: row.objectAddress,
      areaType: row.areaType ?? null,
      gasificationType: row.gasificationType ?? null,
      objectType: row.objectType,
      objectCategory: row.objectCategory,
      objectCategoryOther: row.objectCategoryOther ?? null,
      registrationMode: row.registrationMode,
      status: row.status,
      createdBy: row.createdBy
        ? { id: String(row.createdBy._id), fullName: row.createdBy.fullName }
        : { id: '', fullName: '—' },
      stage: row.processing?.stage ?? 'REGISTERED',
      lastResponseDate: row.processing?.lastResponseDate
        ? toIsoDate(row.processing.lastResponseDate)
        : null,
      lastResponseNumber: row.processing?.lastResponseNumber ?? null,
      tuDate: row.processing?.tuDate ? toIsoDate(row.processing.tuDate) : null,
      tuNumber: row.processing?.tuNumber ?? null,
      contractNumber: row.processing?.contractNumber ?? null,
      gasFlow: row.processing?.gasFlow ?? null,
      connectionType: row.processing?.connectionType ?? null,
      engineerName: row.processing?.engineerName ?? null,
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
