import {
  type ApplicationChangeAction,
  type ApplicationStatus,
  AREA_TYPE_LABELS,
  type AreaType,
  type AuditAction,
  formatPhone,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  type ObjectCategory,
  type ObjectType,
  type Role,
} from '@tu-registry/shared';
import { formatCalendarDate } from './format';

// Enum names live in @tu-registry/shared (the server sorts by them); re-exported for the UI.
export { AREA_TYPE_LABELS, OBJECT_CATEGORY_LABELS, OBJECT_TYPE_LABELS };

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Користувач',
  ADMIN: 'Адміністратор',
};

/** "Інше: котельня" for OTHER with wording, otherwise the category's name. */
export function formatObjectCategory(category: ObjectCategory, other: string | null) {
  return category === 'OTHER' && other ? `Інше: ${other}` : OBJECT_CATEGORY_LABELS[category];
}

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
  APPLICATION_DELETED: 'Видалено заяву',
  ACCESS_DENIED: 'Відмовлено в доступі',
};

/** Names of application fields as they appear in the change history. */
export const APPLICATION_FIELD_LABELS: Record<string, string> = {
  customer: 'Замовник',
  customerRepresentative: 'Представник замовника',
  phone: 'Телефон',
  email: 'Email',
  settlement: 'Населений пункт',
  objectAddress: 'Адреса обʼєкта',
  areaType: 'Місцевість',
  // The field was removed in stage 12; older history entries still mention it.
  cadastralNumber: 'Кадастровий номер',
  objectType: 'Тип обʼєкта',
  objectCategory: 'Категорія обʼєкта',
  objectCategoryOther: 'Категорія (уточнення)',
  comment: 'Коментар',
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
    case 'areaType':
      return AREA_TYPE_LABELS[text as AreaType] ?? text;
    case 'objectCategory':
      return OBJECT_CATEGORY_LABELS[text as ObjectCategory] ?? text;
    case 'status':
      return STATUS_LABELS[text as ApplicationStatus] ?? text;
    default:
      return text;
  }
}
