import {
  type ApplicationChangeAction,
  type ApplicationStatus,
  AREA_TYPE_LABELS,
  type AreaType,
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
  type AuditAction,
  type CalendarDayKind,
  formatPhone,
  GASIFICATION_TYPE_LABELS,
  type GasificationType,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  PROCESSING_STAGE_LABELS,
  REGISTRY_STAGE_LABELS,
  type ObjectCategory,
  type ObjectType,
  type Role,
} from '@tu-registry/shared';
import { formatCalendarDate } from './format';

// Enum names live in @tu-registry/shared (the server sorts by them); re-exported for the UI.
export {
  AREA_TYPE_LABELS,
  GASIFICATION_TYPE_LABELS,
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  GAS_PRESSURE_LABELS,
  OBJECT_CATEGORY_LABELS,
  OBJECT_TYPE_LABELS,
  PROCESSING_STAGE_LABELS,
  REGISTRY_STAGE_LABELS,
};

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Користувач',
  ADMIN: 'Адміністратор',
};

/**
 * One field, named by the object type (agreed 2026-11-18): a domestic object has a personal
 * account, a non-domestic one a contract.
 */
export function accountNumberLabel(objectType: ObjectType | '' | undefined) {
  if (objectType === 'DOMESTIC') return 'Особовий рахунок';
  if (objectType === 'NON_DOMESTIC') return '№ договору';
  return 'Особовий рахунок / № договору';
}

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
  DEPARTMENT_CREATED: 'Створено управління',
  DEPARTMENT_UPDATED: 'Змінено управління',
  DEPARTMENT_ARCHIVED: 'Архівовано управління',
  DEPARTMENT_RESTORED: 'Відновлено управління',
  DEPARTMENT_DELETED: 'Видалено управління',
  ENGINEER_CREATED: 'Додано інженера',
  ENGINEER_UPDATED: 'Змінено інженера',
  ENGINEER_DEACTIVATED: 'Деактивовано інженера',
  CALENDAR_DAY_CREATED: 'Додано день у календар',
  CALENDAR_DAY_UPDATED: 'Змінено день календаря',
  CALENDAR_DAY_DELETED: 'Видалено день з календаря',
  RESPONSE_CREATED: 'Додано відповідь на заяву',
  RESPONSE_UPDATED: 'Змінено відповідь на заяву',
  RESPONSE_CANCELLED: 'Скасовано відповідь на заяву',
  RESPONSE_RESTORED: 'Відновлено відповідь на заяву',
  RESPONSE_DELETED: 'Видалено відповідь на заяву',
  TU_CREATED: 'Внесено технічні умови',
  TU_UPDATED: 'Змінено технічні умови',
  TU_CANCELLED: 'Скасовано технічні умови',
  TU_RESTORED: 'Відновлено технічні умови',
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
  gasificationType: 'Вид газифікації',
  // The field was removed in stage 12; older history entries still mention it.
  cadastralNumber: 'Кадастровий номер',
  objectType: 'Тип обʼєкта',
  objectCategory: 'Категорія обʼєкта',
  objectCategoryOther: 'Категорія (уточнення)',
  accountNumber: 'Особовий рахунок / № договору',
  comment: 'Коментар',
  regDate: 'Дата реєстрації',
  regNumber: 'Номер реєстрації',
  department: 'Управління',
  status: 'Статус',
  annulmentReason: 'Причина анулювання',
};

/** A stored history value, shown the way people read it ("—" for empty). */
/** `departmentName`: departments live in the database, so their names come from the caller. */
export function formatFieldValue(
  field: string,
  value: unknown,
  departmentName?: (id: string) => string,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value);
  switch (field) {
    case 'phone':
      return formatPhone(text);
    case 'regDate':
      return formatCalendarDate(text);
    case 'objectType':
      return OBJECT_TYPE_LABELS[text as ObjectType] ?? text;
    case 'department':
      return departmentName?.(text) || text;
    case 'areaType':
      return AREA_TYPE_LABELS[text as AreaType] ?? text;
    case 'objectCategory':
      return OBJECT_CATEGORY_LABELS[text as ObjectCategory] ?? text;
    case 'gasificationType':
      return GASIFICATION_TYPE_LABELS[text as GasificationType] ?? text;
    case 'status':
      return STATUS_LABELS[text as ApplicationStatus] ?? text;
    default:
      return text;
  }
}

export const CALENDAR_DAY_KIND_LABELS: Record<CalendarDayKind, string> = {
  NON_WORKING: 'Неробочий',
  WORKING: 'Робочий',
};
