import { z } from 'zod';
import { departmentField } from '../departments';
import type { ConnectionType } from '../enums';
import type { ScanDto } from '../scan';

/**
 * «Договір» (agreed 2026-11-20): the connection contract made after the technical conditions.
 * The form starts from the valid TU (their date, customer and address) and the next number of
 * the chosen department; everything stays editable. An application may have several contracts:
 * one is cancelled and another made, or one more added beside it (then the number and the date
 * are entered by hand). Files: the contract as a Word document and the scan of the signed one.
 */
export const CONTRACT_NUMBER_MAX = 50;
export const CONTRACT_CUSTOMER_MAX = 300;
export const CONTRACT_ADDRESS_MAX = 600;
export const CONTRACT_REPRESENTATIVE_MAX = 300;
export const CONTRACT_COMMENT_MAX = 2000;

/** The contract's files as they appear in the API path: the Word document, the signed scan. */
export const CONTRACT_FILE_KINDS = ['document', 'scan'] as const;
export type ContractFileKind = (typeof CONTRACT_FILE_KINDS)[number];

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * «125-15»: the department's own sequence (never reset by the year) and the department's code;
 * a reconstruction contract ends in «-Р» («126-15-Р»), in the same sequence (agreed 2026-11-20).
 */
export function formatContractNumber(
  sequence: number,
  departmentCode: number,
  reconstruction: boolean,
) {
  return `${sequence}-${departmentCode}${reconstruction ? '-Р' : ''}`;
}

const CONTRACT_NUMBER = /^(\d{1,9})-(\d{1,3})(-Р)?$/;

/** The parts of a number in our format; null for a number written some other way. */
export function parseContractNumber(text: string) {
  const match = CONTRACT_NUMBER.exec(text.trim());
  if (!match) return null;
  return {
    sequence: Number(match[1]),
    departmentCode: Number(match[2]),
    reconstruction: match[3] !== undefined,
  };
}

/** «Договір на нестандартне приєднання»: the contract's kind follows the TU's connection. */
export const CONTRACT_TITLES: Record<ConnectionType, string> = {
  STANDARD: 'Договір на стандартне приєднання',
  NON_STANDARD: 'Договір на нестандартне приєднання',
  NON_STANDARD_CAPACITY: 'Договір на нестандартне приєднання (збільшення потужності)',
  RECONSTRUCTION: 'Договір на реконструкцію',
};

const emptyToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;
const requiredText = (label: string, max: number) =>
  z
    .string(`Вкажіть: ${label}`)
    .trim()
    .min(1, `Вкажіть: ${label}`)
    .max(max, `${label}: не більше ${max} символів`);
const optionalText = (label: string, max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label}: не більше ${max} символів`).nullable(),
  );

/** Without `version` it adds a contract, with it changes the one the user saw. */
export const saveContractSchema = z
  .object({
    version: z.number('Відсутня версія документа').int().min(1).optional(),
    contractNumber: requiredText('№ договору', CONTRACT_NUMBER_MAX),
    contractDate: z.iso.date('Вкажіть дату договору'),
    department: departmentField,
    customer: requiredText('замовник', CONTRACT_CUSTOMER_MAX),
    address: requiredText('адреса обʼєкта', CONTRACT_ADDRESS_MAX),
    signedDate: z
      .preprocess(emptyToNull, z.iso.date('Вкажіть коректну дату').nullable())
      .default(null),
    representative: optionalText('представник замовника', CONTRACT_REPRESENTATIVE_MAX).default(
      null,
    ),
    comment: optionalText('коментар', CONTRACT_COMMENT_MAX).default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.signedDate && data.signedDate < data.contractDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['signedDate'],
        message: 'Дата укладання не може бути раніше дати договору',
      });
    }
  });

export type SaveContractInput = z.input<typeof saveContractSchema>;
export type SaveContractData = z.output<typeof saveContractSchema>;

/**
 * What the new contract's form starts with. The number and the date are null when the
 * application already has a valid contract: another one is numbered and dated by hand.
 */
export type ContractDraftDto = {
  connectionType: ConnectionType;
  contractNumber: string | null;
  contractDate: string | null;
  department: string;
  customer: string;
  address: string;
};

type Person = { id: string; fullName: string };

export type ContractDto = {
  id: string;
  applicationId: string;
  /** From the TU it was made after: the kind of the contract. */
  connectionType: ConnectionType;
  contractNumber: string;
  contractDate: string;
  department: string;
  customer: string;
  address: string;
  signedDate: string | null;
  representative: string | null;
  comment: string | null;
  /** The contract as a Word document. */
  document: ScanDto | null;
  /** The scan of the signed contract. */
  scan: ScanDto | null;
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
