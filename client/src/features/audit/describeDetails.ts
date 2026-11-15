import type { AuditLogDto } from '@tu-registry/shared';
import { formatCalendarDate } from '@/shared/lib/format';

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
