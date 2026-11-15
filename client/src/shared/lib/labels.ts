import {
  type ApplicationChangeAction,
  type ApplicationStatus,
  type AuditAction,
  formatPhone,
  type ObjectType,
  type Role,
} from '@tu-registry/shared';
import { formatCalendarDate } from './format';

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Користувач',
  ADMIN: 'Адміністратор',
};

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  DOMESTIC: 'Побутовий',
  NON_DOMESTIC: 'Непобутовий',
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  ACTIVE: 'Активна',
  ANNULLED: 'Анульовано',
};

export const CHANGE_ACTION_LABELS: Record<ApplicationChangeAction, string> = {
  CREATED: 'Зареєстровано',
  UPDATED: 'Змінено',
  ANNULLED: 'Анульовано',
  RESTORED: 'Відновлено',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: 'Вхід',
  LOGIN_FAILED: 'Невдалий вхід',
  LOGOUT: 'Вихід',
  PASSWORD_CHANGED: 'Змінено пароль',
  USER_CREATED: 'Створено користувача',
  USER_UPDATED: 'Змінено користувача',
  USER_DEACTIVATED: 'Деактивовано користувача',
  PASSWORD_RESET: 'Скинуто пароль',
  SESSION_REUSE_DETECTED: 'Підозра на викрадення сесії',
  APPLICATION_CREATED: 'Зареєстровано заяву',
  APPLICATION_MANUAL_CREATED: 'Внесено заяву вручну',
  REG_NUMBER_CHANGED: 'Змінено номер заяви',
  REG_DATE_CHANGED: 'Змінено дату реєстрації',
  APPLICATION_ANNULLED: 'Анульовано заяву',
  APPLICATION_RESTORED: 'Відновлено заяву',
  ACCESS_DENIED: 'Відмовлено в доступі',
};

/** Names of application fields as they appear in the change history. */
export const APPLICATION_FIELD_LABELS: Record<string, string> = {
  customer: 'Замовник',
  customerRepresentative: 'Представник замовника',
  phone: 'Телефон',
  email: 'Email',
  objectAddress: 'Адреса обʼєкта',
  objectType: 'Тип обʼєкта',
  regDate: 'Дата реєстрації',
  regNumber: 'Номер реєстрації',
  status: 'Статус',
  annulmentReason: 'Причина анулювання',
};

/** A stored history value, shown the way people read it ("—" for empty). */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value);
  switch (field) {
    case 'phone':
      return formatPhone(text);
    case 'regDate':
      return formatCalendarDate(text);
    case 'objectType':
      return OBJECT_TYPE_LABELS[text as ObjectType] ?? text;
    case 'status':
      return STATUS_LABELS[text as ApplicationStatus] ?? text;
    default:
      return text;
  }
}
