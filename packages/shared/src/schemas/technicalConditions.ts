import { z } from 'zod';
import {
  CONNECTION_POINTS,
  CONNECTION_TYPES,
  type ConnectionPoint,
  type ConnectionType,
  GAS_PRESSURES,
  type GasPressure,
} from '../enums';
import type { ScanDto } from '../scan';
import { SETTLEMENT_MAX } from './application';
import type { PreviousScanDto } from './response';

/**
 * Technical conditions prepared for an application (stage 17.4). One valid set per
 * application: new ones only after the previous are cancelled. Cancelled, never deleted.
 */
export const TU_NUMBER_MAX = 50;
export const GAS_FLOW_MAX = 100_000;
/** The same limits as the application's customer and «населений пункт, адреса». */
export const TU_CUSTOMER_MAX = 300;
export const TU_ADDRESS_MAX = SETTLEMENT_MAX + 2 + 500;

/** «м. Одеса» + «вул. Лесі Українки, 34» → «м. Одеса, вул. Лесі Українки, 34». */
export const fullAddress = (settlement: string | null, objectAddress: string) =>
  [settlement, objectAddress].filter(Boolean).join(', ');

const tuNumberField = z
  .string('Вкажіть номер ТУ')
  .trim()
  .min(1, 'Вкажіть номер ТУ')
  .max(TU_NUMBER_MAX, `Номер: не більше ${TU_NUMBER_MAX} символів`);
const preparedDateField = z.iso.date('Вкажіть коректну дату');
const engineerField = z.string('Оберіть інженера').regex(/^[a-f\d]{24}$/i, 'Оберіть інженера');
const versionField = z.number('Відсутня версія документа').int().min(1);
const textField = (label: string, max: number) =>
  z
    .string(`Вкажіть: ${label}`)
    .trim()
    .min(1, `Вкажіть: ${label}`)
    .max(max, `${label}: не більше ${max} символів`);

/** m³/h with up to three decimals; the form sends "2,5", an API client 2.5. */
const gasFlowField = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() !== ''
      ? Number(value.trim().replace(',', '.'))
      : value,
  z
    .number('Вкажіть витрати газу числом')
    .positive('Витрати газу мають бути більшими за нуль')
    .max(GAS_FLOW_MAX, `Витрати газу: не більше ${GAS_FLOW_MAX.toLocaleString('uk-UA')} м³/год`)
    .refine(
      (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
      'Не більше трьох знаків після коми',
    ),
);

const fields = {
  tuNumber: tuNumberField,
  preparedDate: preparedDateField,
  engineer: engineerField,
  gasFlow: gasFlowField,
  connectionType: z.enum(CONNECTION_TYPES, 'Оберіть тип приєднання'),
  gasPressure: z.enum(GAS_PRESSURES, 'Оберіть тиск газу'),
  connectionPoint: z.enum(CONNECTION_POINTS, 'Оберіть точку приєднання'),
  // As written in the conditions; may differ from the application's (stage 19).
  customer: textField('замовник за ТУ', TU_CUSTOMER_MAX),
  address: textField('адреса за ТУ', TU_ADDRESS_MAX),
};

/** Without the customer or the address the server takes the application's (older clients). */
export const createTechnicalConditionsSchema = z
  .object(fields)
  .partial({ customer: true, address: true })
  .strict();

export const updateTechnicalConditionsSchema = z
  .object({ version: versionField, ...fields })
  .partial({
    tuNumber: true,
    preparedDate: true,
    engineer: true,
    gasFlow: true,
    connectionType: true,
    gasPressure: true,
    connectionPoint: true,
    customer: true,
    address: true,
  })
  .strict()
  .refine(
    (data) => Object.keys(data).some((key) => key !== 'version'),
    'Немає змін для збереження',
  );

export type CreateTechnicalConditionsInput = z.input<typeof createTechnicalConditionsSchema>;
export type CreateTechnicalConditionsData = z.output<typeof createTechnicalConditionsSchema>;
export type UpdateTechnicalConditionsInput = z.input<typeof updateTechnicalConditionsSchema>;
export type UpdateTechnicalConditionsData = z.output<typeof updateTechnicalConditionsSchema>;

type Person = { id: string; fullName: string };

export type TechnicalConditionsDto = {
  id: string;
  applicationId: string;
  tuNumber: string;
  preparedDate: string;
  engineer: Person;
  gasFlow: number;
  connectionType: ConnectionType;
  gasPressure: GasPressure;
  connectionPoint: ConnectionPoint;
  customer: string;
  address: string;
  /** Working days from the registration date (not counted) to the preparation date. */
  workingDays: number;
  scan: ScanDto | null;
  previousScans: PreviousScanDto[];
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
