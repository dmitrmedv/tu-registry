import {
  APPLICATION_STATUSES,
  APPLICATION_SORTS,
  type ApplicationStatus,
  type ApplicationListQuery,
  type ApplicationSort,
  AREA_TYPES,
  type AreaType,
  DEFAULT_DEPARTMENT,
  type Department,
  DEPARTMENTS,
  OBJECT_CATEGORIES,
  OBJECT_TYPES,
  type ObjectCategory,
  type ObjectType,
  PAGE_SIZES,
  regNumberSearchField,
  type Role,
} from '@tu-registry/shared';

/** Registry state as it lives in the URL (?customer=…&type=…&page=2). */
export type RegistryParams = {
  page: number;
  limit: number;
  sort: ApplicationSort;
  customer: string;
  settlement: string;
  address: string;
  representative: string;
  comment: string;
  number: string;
  type: ObjectType | '';
  category: ObjectCategory | '';
  area: AreaType | '';
  status: ApplicationStatus | '';
  /** "all" (default), "mine", or a user id. */
  user: string;
  /** Admins only (users always get their own): a department or "all"; Одеське by default. */
  department: Department | 'all';
  from: string;
  to: string;
};

export const DEFAULT_PARAMS: RegistryParams = {
  page: 1,
  limit: 20,
  sort: '-regDate',
  customer: '',
  settlement: '',
  address: '',
  representative: '',
  comment: '',
  number: '',
  type: '',
  category: '',
  area: '',
  status: '',
  user: 'all',
  department: DEFAULT_DEPARTMENT,
  from: '',
  to: '',
};

const FILTER_KEYS = [
  'customer',
  'settlement',
  'address',
  'representative',
  'comment',
  'number',
  'type',
  'category',
  'area',
  'status',
  'from',
  'to',
] as const;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the URL defensively: anything malformed falls back to the default. */
export function readParams(search: URLSearchParams): RegistryParams {
  const text = (key: string) => search.get(key)?.trim() ?? '';
  const page = Number(search.get('page'));
  const limit = Number(search.get('limit'));
  const sort = search.get('sort') as ApplicationSort;
  const type = search.get('type') as ObjectType;
  const category = search.get('category') as ObjectCategory;
  const area = search.get('area') as AreaType;
  const status = search.get('status') as ApplicationStatus;
  const user = text('user');
  const department = text('department') as Department | 'all';
  const date = (key: string) => (ISO_DATE.test(text(key)) ? text(key) : '');
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_PARAMS.limit,
    sort: APPLICATION_SORTS.includes(sort) ? sort : DEFAULT_PARAMS.sort,
    customer: text('customer'),
    settlement: text('settlement'),
    address: text('address'),
    representative: text('representative'),
    comment: text('comment'),
    number: text('number'),
    type: OBJECT_TYPES.includes(type) ? type : '',
    category: OBJECT_CATEGORIES.includes(category) ? category : '',
    area: AREA_TYPES.includes(area) ? area : '',
    status: APPLICATION_STATUSES.includes(status) ? status : '',
    user: user === 'mine' || OBJECT_ID.test(user) ? user : 'all',
    department:
      department === 'all' || DEPARTMENTS.includes(department as Department)
        ? department
        : DEFAULT_DEPARTMENT,
    from: date('from'),
    to: date('to'),
  };
}

/** Writes only non-default values, so URLs stay short and readable. */
export function writeParams(params: RegistryParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [keyof RegistryParams, string | number][]) {
    if (value !== DEFAULT_PARAMS[key] && value !== '') search.set(key, String(value));
  }
  return search;
}

export function countActiveFilters(params: RegistryParams) {
  const department = params.department !== DEFAULT_DEPARTMENT ? 1 : 0;
  return (
    FILTER_KEYS.filter((key) => params[key] !== '').length +
    (params.user !== 'all' ? 1 : 0) +
    department
  );
}

export function isNumberSearchValid(value: string) {
  return regNumberSearchField.safeParse(value).success;
}

/** Period in the wrong order: the end is ignored until fixed. */
export function isPeriodValid(params: RegistryParams) {
  return !params.from || !params.to || params.from <= params.to;
}

/** URL state → API query. Invalid inputs are left out instead of failing the request. */
type Viewer = { id: string; role: Role };

export function toApiQuery(params: RegistryParams, viewer: Viewer): ApplicationListQuery {
  const currentUserId = viewer.id;
  return {
    page: params.page,
    limit: params.limit,
    sort: params.sort,
    customer: params.customer || undefined,
    settlement: params.settlement || undefined,
    customerRepresentative: params.representative || undefined,
    comment: params.comment || undefined,
    areaType: params.area || undefined,
    address: params.address || undefined,
    number: params.number && isNumberSearchValid(params.number) ? params.number : undefined,
    objectType: params.type || undefined,
    objectCategory: params.category || undefined,
    status: params.status || undefined,
    createdBy:
      params.user === 'mine' ? currentUserId : params.user === 'all' ? undefined : params.user,
    dateFrom: params.from || undefined,
    dateTo: params.to && isPeriodValid(params) ? params.to : undefined,
    // A user's registry is always their department (the server enforces it): nothing to send.
    department:
      viewer.role === 'ADMIN' && params.department !== 'all' ? params.department : undefined,
  };
}
