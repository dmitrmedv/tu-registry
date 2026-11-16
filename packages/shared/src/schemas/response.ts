import { z } from 'zod';
import type { ScanDto } from '../scan';

/**
 * A response to an application (stage 17.3): given when technical conditions cannot be
 * prepared yet. An application may get several; none closes it. Cancelled, never deleted.
 */
export const OUTGOING_NUMBER_MAX = 50;
export const CANCEL_REASON_MIN = 3;
export const CANCEL_REASON_MAX = 500;

const outgoingNumberField = z
  .string('Вкажіть номер вихідного')
  .trim()
  .min(1, 'Вкажіть номер вихідного')
  .max(OUTGOING_NUMBER_MAX, `Номер: не більше ${OUTGOING_NUMBER_MAX} символів`);
const documentDateField = z.iso.date('Вкажіть коректну дату');
const engineerField = z.string('Оберіть інженера').regex(/^[a-f\d]{24}$/i, 'Оберіть інженера');
const versionField = z.number('Відсутня версія документа').int().min(1);

export const createResponseSchema = z
  .object({
    outgoingNumber: outgoingNumberField,
    responseDate: documentDateField,
    engineer: engineerField,
  })
  .strict();

/** `documentsReceivedAt: null` clears a date entered by mistake. */
export const updateResponseSchema = z
  .object({
    version: versionField,
    outgoingNumber: outgoingNumberField.optional(),
    responseDate: documentDateField.optional(),
    engineer: engineerField.optional(),
    documentsReceivedAt: documentDateField.nullable().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).some((key) => key !== 'version'),
    'Немає змін для збереження',
  );

export const cancelDocumentSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(CANCEL_REASON_MIN, 'Вкажіть причину скасування')
      .max(CANCEL_REASON_MAX, `Причина: не більше ${CANCEL_REASON_MAX} символів`),
    version: versionField,
  })
  .strict();

export const restoreDocumentSchema = z.object({ version: versionField }).strict();

/** `file`: one of the document's earlier scans; the current one when absent. */
export const documentScanQuerySchema = z.object({
  file: z
    .string()
    .regex(/^[0-9a-f-]{36}$/, 'Некоректний файл')
    .optional(),
});

export type CreateResponseInput = z.input<typeof createResponseSchema>;
export type UpdateResponseInput = z.input<typeof updateResponseSchema>;
export type CancelDocumentInput = z.input<typeof cancelDocumentSchema>;

type Person = { id: string; fullName: string };

/** A replaced scan, kept: `id` opens it through GET …/scan?file=<id>. */
export type PreviousScanDto = ScanDto & { id: string };

export type ResponseDto = {
  id: string;
  applicationId: string;
  outgoingNumber: string;
  responseDate: string;
  /** The engineer's name as it was when chosen. */
  engineer: Person;
  /** When the customer brought the missing documents after this response. */
  documentsReceivedAt: string | null;
  /** Working days from the registration date (not counted) to the response date. */
  workingDays: number;
  scan: ScanDto | null;
  previousScans: PreviousScanDto[];
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
