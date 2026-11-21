import type {
  AreaType,
  ConnectionPoint,
  ConnectionType,
  GasificationType,
  GasPressure,
  ObjectCategory,
  ObjectType,
  ProcessingStage,
} from './enums';

// Names of enum values as people read them. Shared: the client shows them and the server
// sorts the registry by them (alphabetical order of the names, not of the codes).

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  DOMESTIC: 'Побутовий',
  NON_DOMESTIC: 'Непобутовий',
};

export const OBJECT_CATEGORY_LABELS: Record<ObjectCategory, string> = {
  LAND_PLOT: 'Земельна ділянка',
  RESIDENTIAL_HOUSE: 'Житловий будинок',
  APARTMENT: 'Квартира',
  NON_RESIDENTIAL: 'Нежитлове приміщення',
  BIOGAS_PRODUCER: 'Виробник біогазу',
  OTHER: 'Інше',
};

export const AREA_TYPE_LABELS: Record<AreaType, string> = {
  URBAN: 'Міська',
  RURAL: 'Сільська',
};

export const GASIFICATION_TYPE_LABELS: Record<GasificationType, string> = {
  NEW: 'Нова газифікація',
  RECONSTRUCTION: 'Реконструкція',
};

export const PROCESSING_STAGE_LABELS: Record<ProcessingStage, string> = {
  REGISTERED: 'Зареєстрована',
  IN_PROGRESS: 'На опрацюванні',
  RESPONDED: 'Відповідь надана',
  TU_PREPARED: 'ТУ підготовлені',
};

/** The registry's «Стан»: an annulled application shows as annulled, whatever its stage. */
export const REGISTRY_STAGE_LABELS = {
  ...PROCESSING_STAGE_LABELS,
  ANNULLED: 'Анульована',
} as const;

export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  STANDARD: 'Стандартне',
  NON_STANDARD: 'Нестандартне',
  NON_STANDARD_CAPACITY: 'Нестандартне (збільшення потужності)',
  RECONSTRUCTION: 'Реконструкція',
};

/** The connection as the card's header names it (mock-up of 2026-11-20). */
export const CONNECTION_TYPE_TITLES: Record<ConnectionType, string> = {
  STANDARD: 'Стандартне приєднання',
  NON_STANDARD: 'Нестандартне приєднання',
  NON_STANDARD_CAPACITY: 'Нестандартне приєднання (збільшення потужності)',
  RECONSTRUCTION: 'Реконструкція',
};

export const GAS_PRESSURE_LABELS: Record<GasPressure, string> = {
  LOW: 'Низький',
  MEDIUM: 'Середній',
  HIGH: 'Високий',
};

export const CONNECTION_POINT_LABELS: Record<ConnectionPoint, string> = {
  ABOVE_GROUND: 'Надземний газопровід',
  UNDERGROUND: 'Підземний газопровід',
};

const ukrainian = new Intl.Collator('uk');

/** The codes of an enum ordered by their names, e.g. for sorting a column alphabetically. */
export function codesByLabel<Code extends string>(labels: Record<Code, string>): Code[] {
  return (Object.keys(labels) as Code[]).sort((a, b) => ukrainian.compare(labels[a], labels[b]));
}
