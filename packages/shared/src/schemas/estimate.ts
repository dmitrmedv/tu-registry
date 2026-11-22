import { z } from 'zod';
import type { ScanDto } from '../scan';
import { amountField } from './tuPayment';

/**
 * «Кошторис» (agreed 2026-11-21): split from the project, like the payment from its technical
 * conditions. The customer may pay long after the estimate was agreed, so it is recalculated
 * without the project being approved again: a new estimate replaces the current one, which stays
 * in the card as «Перераховано» with its files. Only the current estimate of the valid project
 * is changed. Each has the date it was checked, its sum, its scan (PDF) and the IMD check file.
 */
export const ESTIMATE_FILE_KINDS = ['scan', 'imd'] as const;
export type EstimateFileKind = (typeof ESTIMATE_FILE_KINDS)[number];

/** IMD has no registered type: browsers send it as a generic binary file. */
export const IMD_MIME_TYPE = 'application/octet-stream';

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

const estimateFields = {
  checkDate: z
    .preprocess(emptyToNull, z.iso.date('Вкажіть коректну дату').nullable())
    .default(null),
  /** Hryvnias with kopecks, like the payments; stored in kopecks. */
  amount: z.preprocess(emptyToNull, amountField.nullable()).default(null),
  /** «Сума по кошторису (субпідряд)» (2026-11-21): optional, like the sum. */
  subcontractAmount: z.preprocess(emptyToNull, amountField.nullable()).default(null),
};

/** A new estimate: the first one, or a recalculation that replaces the current one. */
export const createEstimateSchema = z.object(estimateFields).strict();

/** Saves the whole form of the estimate the user saw (`version`). */
export const updateEstimateSchema = z
  .object({ ...estimateFields, version: z.number('Відсутня версія документа').int().min(1) })
  .strict();

export type CreateEstimateInput = z.input<typeof createEstimateSchema>;
export type CreateEstimateData = z.output<typeof createEstimateSchema>;
export type UpdateEstimateInput = z.input<typeof updateEstimateSchema>;
export type UpdateEstimateData = z.output<typeof updateEstimateSchema>;

type Person = { id: string; fullName: string };

export type EstimateDto = {
  id: string;
  applicationId: string;
  projectId: string;
  checkDate: string | null;
  /** Hryvnias. */
  amount: number | null;
  /** Hryvnias: the subcontract's part of the estimate. */
  subcontractAmount: number | null;
  scan: ScanDto | null;
  imd: ScanDto | null;
  /** Replaced by a recalculation: kept, no longer changed. */
  superseded: { at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
