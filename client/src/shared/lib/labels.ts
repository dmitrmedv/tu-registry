import {
  type ApplicationChangeAction,
  type ApplicationStatus,
  AREA_TYPE_LABELS,
  type AreaType,
  CONNECTION_POINT_LABELS,
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPE_TITLES,
  GAS_PRESSURE_LABELS,
  type AuditAction,
  type CalendarDayKind,
  formatMonth,
  formatPhone,
  GASIFICATION_TYPE_LABELS,
  type HistoryDocumentKind,
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
  CONNECTION_TYPE_TITLES,
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
  CANCELLED: 'Скасовано',
  DELETED: 'Видалено',
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
  TU_DELETED: 'Видалено технічні умови',
  TU_PAYMENT_CREATED: 'Внесено рахунок за технічні умови',
  TU_PAYMENT_UPDATED: 'Змінено оплату за технічні умови',
  TU_PAYMENT_DELETED: 'Видалено оплату за технічні умови',
  CONTRACT_CREATED: 'Додано договір',
  CONTRACT_UPDATED: 'Змінено договір',
  CONTRACT_CANCELLED: 'Анульовано договір',
  CONTRACT_DELETED: 'Видалено договір',
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

/** Fields of the TU payment, in the journal and the history. */
export const PAYMENT_FIELD_LABELS: Record<string, string> = {
  invoiceNumber: '№ рахунку',
  invoiceDate: 'дата рахунку',
  amount: 'сума',
  paidDate: 'дата оплати',
  paidAmount: 'фактична оплата',
  actTransferMonth: 'Здача акта',
  invoiceScan: 'скан рахунку',
  receiptScan: 'скан квитанції',
  actScan: 'скан акта',
  contractNumber: '№ договору',
  contractDate: 'дата договору',
  contractScan: 'скан договору',
  contractDocument: 'договір (DOCX)',
};

/** Fields of the contract, in the journal and the history. */
export const CONTRACT_FIELD_LABELS: Record<string, string> = {
  contractNumber: '№ договору',
  contractDate: 'дата договору',
  department: 'управління',
  customer: 'замовник',
  address: 'адреса обʼєкта',
  signedDate: 'дата укладання',
  representative: 'представник замовника',
  comment: 'коментар',
  document: 'документ договору',
  scan: 'скан укладеного договору',
};

/** Fields of responses and technical conditions, in the journal and the history. */
export const DOCUMENT_FIELD_LABELS: Record<string, string> = {
  outgoingNumber: 'номер',
  responseDate: 'дата',
  engineer: 'інженер',
  documentsReceivedAt: 'документи надійшли',
  tuNumber: 'номер',
  preparedDate: 'дата',
  gasFlow: 'витрати газу',
  connectionType: 'тип приєднання',
  gasPressure: 'тиск',
  connectionPoint: 'точка приєднання',
  customer: 'замовник за ТУ',
  address: 'адреса за ТУ',
  scan: 'скан',
};

/** Values of the technical conditions' enum fields. */
export const TU_VALUE_LABELS: Record<string, Record<string, string>> = {
  connectionType: CONNECTION_TYPE_LABELS,
  gasPressure: GAS_PRESSURE_LABELS,
  connectionPoint: CONNECTION_POINT_LABELS,
};

/** The documents in «Історія змін» (with their number after «№»). */
export const HISTORY_DOCUMENT_LABELS: Record<HistoryDocumentKind, string> = {
  RESPONSE: 'Відповідь',
  TECHNICAL_CONDITIONS: 'Технічні умови',
  TU_PAYMENT: 'Рахунок за ТУ',
  CONTRACT: 'Договір',
};

/** What was done to a document: added rather than registered. */
export const DOCUMENT_CHANGE_ACTION_LABELS: Record<ApplicationChangeAction, string> = {
  CREATED: 'додано',
  UPDATED: 'змінено',
  ANNULLED: 'анульовано',
  RESTORED: 'відновлено',
  CANCELLED: 'скасовано',
  DELETED: 'видалено',
};

const FIELD_LABELS: Partial<Record<HistoryDocumentKind, Record<string, string>>> = {
  TU_PAYMENT: PAYMENT_FIELD_LABELS,
  CONTRACT: CONTRACT_FIELD_LABELS,
};
const DOCUMENT_SCAN_FIELDS = new Set([
  'scan',
  'invoiceScan',
  'receiptScan',
  'actScan',
  'contractScan',
  'contractDocument',
]);

/**
 * A changed field of a document in the history: «Номер: 125/01 → 126/01», «Скан: додано».
 * `departmentName`: a contract's department is stored by id.
 */
export function describeDocumentChange(
  kind: HistoryDocumentKind,
  { field, oldValue, newValue }: { field: string; oldValue: unknown; newValue: unknown },
  departmentName?: (id: string) => string,
) {
  const labels = FIELD_LABELS[kind] ?? DOCUMENT_FIELD_LABELS;
  const name = labels[field] ?? field;
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  if (DOCUMENT_SCAN_FIELDS.has(field) || (kind === 'CONTRACT' && field === 'document')) {
    // Never a file name: only what happened to the scan.
    return {
      label,
      oldValue: null,
      newValue: !oldValue ? 'додано' : newValue ? 'замінено' : 'видалено',
    };
  }
  const show = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '—';
    const text = String(value);
    if (field === 'department') return departmentName?.(text) || text;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatCalendarDate(text);
    if (/^\d{4}-\d{2}$/.test(text)) return formatMonth(text);
    return TU_VALUE_LABELS[field]?.[text] ?? text;
  };
  return { label, oldValue: oldValue === null ? null : show(oldValue), newValue: show(newValue) };
}

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
