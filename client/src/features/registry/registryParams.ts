import {
  APPLICATION_SORTS,
  type ApplicationListQuery,
  type ApplicationSort,
  OBJECT_TYPES,
  type ObjectType,
  PAGE_SIZES,
  regNumberSearchField,
} from '@tu-registry/shared';

/** Registry state as it lives in the URL (?customer=…&type=…&page=2). */
export type RegistryParams = {
  page: number;
  limit: number;
  sort: ApplicationSort;
  customer: string;
  address: string;
  number: string;
  type: ObjectType | '';
  /** "mine" (default), "all", or a user id. */
  user: string;
  from: string;
  to: string;
};

export const DEFAULT_PARAMS: RegistryParams = {
  page: 1,
  limit: 20,
  sort: '-regDate',
  customer: '',
  address: '',
  number: '',
  type: '',
  user: 'mine',
  from: '',
  to: '',
};

const FILTER_KEYS = ['customer', 'address', 'number', 'type', 'from', 'to'] as const;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the URL defensively: anything malformed falls back to the default. */
export function readParams(search: URLSearchParams): RegistryParams {
  const text = (key: string) => search.get(key)?.trim() ?? '';
  const page = Number(search.get('page'));
  const limit = Number(search.get('limit'));
  const sort = search.get('sort') as ApplicationSort;
  const type = search.get('type') as ObjectType;
  const user = text('user');
  const date = (key: string) => (ISO_DATE.test(text(key)) ? text(key) : '');
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_PARAMS.limit,
    sort: APPLICATION_SORTS.includes(sort) ? sort : DEFAULT_PARAMS.sort,
    customer: text('customer'),
    address: text('address'),
    number: text('number'),
    type: OBJECT_TYPES.includes(type) ? type : '',
    user: user === 'all' || OBJECT_ID.test(user) ? user : 'mine',
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
  return FILTER_KEYS.filter((key) => params[key] !== '').length + (params.user !== 'mine' ? 1 : 0);
}

export function isNumberSearchValid(value: string) {
  return regNumberSearchField.safeParse(value).success;
}

/** Period in the wrong order: the end is ignored until fixed. */
export function isPeriodValid(params: RegistryParams) {
  return !params.from || !params.to || params.from <= params.to;
}

/** URL state → API query. Invalid inputs are left out instead of failing the request. */
export function toApiQuery(params: RegistryParams, currentUserId: string): ApplicationListQuery {
  return {
    page: params.page,
    limit: params.limit,
    sort: params.sort,
    customer: params.customer || undefined,
    address: params.address || undefined,
    number: params.number && isNumberSearchValid(params.number) ? params.number : undefined,
    objectType: params.type || undefined,
    createdBy:
      params.user === 'mine' ? currentUserId : params.user === 'all' ? undefined : params.user,
    dateFrom: params.from || undefined,
    dateTo: params.to && isPeriodValid(params) ? params.to : undefined,
  };
}
