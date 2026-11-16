import type { AuditLogDto, CalendarDayKind } from '@tu-registry/shared';
import { formatCalendarDate } from '@/shared/lib/format';
import { CALENDAR_DAY_KIND_LABELS } from '@/shared/lib/labels';

const LOGIN_FAILURE_REASONS: Record<string, string> = {
  UNKNOWN_LOGIN: 'невідомий логін',
  WRONG_PASSWORD: 'невірний пароль',
  INACTIVE_USER: 'обліковий запис деактивовано',
};

const USER_FIELD_LABELS: Record<string, string> = {
  fullName: 'ПІБ',
  department: 'управління',
  role: 'роль',
  canManageRegistration: 'уповноважений',
  isActive: 'активний',
};

const RESPONSE_FIELD_LABELS: Record<string, string> = {
  outgoingNumber: 'номер',
  responseDate: 'дата',
  engineer: 'інженер',
  documentsReceivedAt: 'документи надійшли',
};

const ENGINEER_FIELD_LABELS: Record<string, string> = { fullName: 'ПІБ' };

const DEPARTMENT_FIELD_LABELS: Record<string, string> = { name: 'назва', code: 'код' };

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));

/** A short, human-readable summary of an entry's details for the journal table. */
export function describeDetails(entry: AuditLogDto): string {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'LOGIN_FAILED': {
      const reason = LOGIN_FAILURE_REASONS[text(d.reason)] ?? text(d.reason);
      return `логін «${text(d.login)}», ${reason}`;
    }
    case 'REG_NUMBER_CHANGED':
      return `${text(d.from)} → ${text(d.to)}`;
    case 'REG_DATE_CHANGED':
      return `${formatCalendarDate(text(d.from))} → ${formatCalendarDate(text(d.to))}`;
    case 'USER_UPDATED':
    case 'USER_DEACTIVATED': {
      const changes = Array.isArray(d.changes) ? (d.changes as { field: string }[]) : [];
      return changes.map((c) => USER_FIELD_LABELS[c.field] ?? c.field).join(', ');
    }
    case 'DEPARTMENT_CREATED':
    case 'DEPARTMENT_ARCHIVED':
    case 'DEPARTMENT_RESTORED':
    case 'DEPARTMENT_DELETED':
      return d.code !== undefined ? `код ${text(d.code)}` : '';
    case 'DEPARTMENT_UPDATED': {
      const changes = Array.isArray(d.changes)
        ? (d.changes as { field: string; from: unknown; to: unknown }[])
        : [];
      return changes
        .map(
          (c) => `${DEPARTMENT_FIELD_LABELS[c.field] ?? c.field}: ${text(c.from)} → ${text(c.to)}`,
        )
        .join(', ');
    }
    case 'ENGINEER_UPDATED': {
      const changes = Array.isArray(d.changes)
        ? (d.changes as { field: string; from: unknown; to: unknown }[])
        : [];
      return changes
        .map((c) =>
          c.field === 'isActive'
            ? c.to
              ? 'активовано'
              : 'деактивовано'
            : `${ENGINEER_FIELD_LABELS[c.field] ?? c.field}: ${text(c.from)} → ${text(c.to)}`,
        )
        .join(', ');
    }
    case 'CALENDAR_DAY_CREATED':
    case 'CALENDAR_DAY_DELETED':
      return `${CALENDAR_DAY_KIND_LABELS[d.kind as CalendarDayKind] ?? text(d.kind)}: ${text(d.description)}`;
    case 'CALENDAR_DAY_UPDATED': {
      const changes = Array.isArray(d.changes)
        ? (d.changes as { field: string; from: unknown; to: unknown }[])
        : [];
      const show = (field: string, value: unknown) =>
        field === 'kind'
          ? (CALENDAR_DAY_KIND_LABELS[value as CalendarDayKind] ?? text(value))
          : text(value);
      return changes.map((c) => `${show(c.field, c.from)} → ${show(c.field, c.to)}`).join(', ');
    }
    case 'RESPONSE_CREATED':
      return d.responseDate ? `від ${formatCalendarDate(text(d.responseDate))}` : '';
    case 'RESPONSE_UPDATED': {
      const changes = Array.isArray(d.changes)
        ? (d.changes as { field: string; from: unknown; to: unknown }[])
        : [];
      const show = (field: string, value: unknown) =>
        value === null || value === undefined
          ? '—'
          : field === 'responseDate' || field === 'documentsReceivedAt'
            ? formatCalendarDate(text(value))
            : text(value);
      return changes
        .map((c) =>
          c.field === 'scan'
            ? c.from
              ? 'замінено скан'
              : 'додано скан'
            : `${RESPONSE_FIELD_LABELS[c.field] ?? c.field}: ${show(c.field, c.from)} → ${show(c.field, c.to)}`,
        )
        .join(', ');
    }
    case 'APPLICATION_DELETED':
      return d.regDate ? `заява від ${formatCalendarDate(text(d.regDate))}` : '';
    case 'ACCESS_DENIED':
      return `${text(d.method)} ${text(d.path)}`.trim();
    case 'USER_CREATED':
      return d.via === 'seed' ? 'початкове налаштування' : '';
    default:
      return '';
  }
}
