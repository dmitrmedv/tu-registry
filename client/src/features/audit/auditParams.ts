import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditListQuery,
  PAGE_SIZES,
} from '@tu-registry/shared';

/** Journal state as it lives in the URL (/audit?action=LOGIN_FAILED&page=2). */
export type AuditParams = {
  page: number;
  limit: number;
  action: AuditAction | '';
  actor: string;
  from: string;
  to: string;
};

export const DEFAULT_AUDIT_PARAMS: AuditParams = {
  page: 1,
  limit: 50,
  action: '',
  actor: '',
  from: '',
  to: '',
};

const OBJECT_ID = /^[a-f\d]{24}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readAuditParams(search: URLSearchParams): AuditParams {
  const text = (key: string) => search.get(key)?.trim() ?? '';
  const page = Number(search.get('page'));
  const limit = Number(search.get('limit'));
  const action = text('action') as AuditAction;
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_AUDIT_PARAMS.limit,
    action: AUDIT_ACTIONS.includes(action) ? action : '',
    actor: OBJECT_ID.test(text('actor')) ? text('actor') : '',
    from: ISO_DATE.test(text('from')) ? text('from') : '',
    to: ISO_DATE.test(text('to')) ? text('to') : '',
  };
}

export function writeAuditParams(params: AuditParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [keyof AuditParams, string | number][]) {
    if (value !== DEFAULT_AUDIT_PARAMS[key] && value !== '') search.set(key, String(value));
  }
  return search;
}

export const isAuditPeriodValid = (p: AuditParams) => !p.from || !p.to || p.from <= p.to;

export function toAuditQuery(params: AuditParams): AuditListQuery {
  return {
    page: params.page,
    limit: params.limit,
    action: params.action || undefined,
    actor: params.actor || undefined,
    dateFrom: params.from || undefined,
    dateTo: params.to && isAuditPeriodValid(params) ? params.to : undefined,
  };
}

export const countAuditFilters = (p: AuditParams) =>
  [p.action, p.actor, p.from, p.to].filter(Boolean).length;
