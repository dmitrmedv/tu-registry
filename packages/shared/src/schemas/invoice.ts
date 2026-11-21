import { z } from 'zod';
import type { ScanDto } from '../scan';
import { amountField, fromKopecks, toKopecks } from './tuPayment';

/**
 * «Рахунок» (agreed 2026-11-21): the bill for the connection, made under the valid project. Its
 * works come in three groups — construction and assembly, the tie-in, and the work plan (ПВР) —
 * each a list of named sums; the total is what the customer pays. An application may have
 * several invoices, one per stage of construction: each becomes its own additional agreement.
 * Files: the invoice's scan and the document it was made from (both PDF).
 */
export const INVOICE_NUMBER_MAX = 50;
export const INVOICE_WORK_NAME_MAX = 300;
export const INVOICE_WORKS_MAX = 100;

/** The groups of works, in the order shown. */
export const INVOICE_WORK_GROUPS = ['CONSTRUCTION', 'TIE_IN', 'WORK_PLAN'] as const;
export type InvoiceWorkGroup = (typeof INVOICE_WORK_GROUPS)[number];

/** The invoice's files as they appear in the API path: its scan and the basis document. */
export const INVOICE_FILE_KINDS = ['scan', 'basis'] as const;
export type InvoiceFileKind = (typeof INVOICE_FILE_KINDS)[number];

/** One work: its name as written and its cost in hryvnias. */
export const invoiceWorkSchema = z.object({
  name: z
    .string('Вкажіть назву роботи')
    .trim()
    .min(1, 'Вкажіть назву роботи')
    .max(INVOICE_WORK_NAME_MAX, `Назва: не більше ${INVOICE_WORK_NAME_MAX} символів`),
  amount: amountField,
});

const fields = {
  invoiceNumber: z
    .string('Вкажіть № рахунку')
    .trim()
    .min(1, 'Вкажіть № рахунку')
    .max(INVOICE_NUMBER_MAX, `№ рахунку: не більше ${INVOICE_NUMBER_MAX} символів`),
  invoiceDate: z.iso.date('Вкажіть коректну дату'),
  works: z
    .array(invoiceWorkSchema.extend({ group: z.enum(INVOICE_WORK_GROUPS, 'Оберіть групу робіт') }))
    .min(1, 'Додайте хоча б одну роботу')
    .max(INVOICE_WORKS_MAX, `Не більше ${INVOICE_WORKS_MAX} робіт`),
};

/** The whole form: the works are always sent together, in their order. */
export const createInvoiceSchema = z.object(fields).strict();
export const updateInvoiceSchema = z
  .object({ ...fields, version: z.number('Відсутня версія документа').int().min(1) })
  .strict();

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceData = z.output<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.input<typeof updateInvoiceSchema>;
export type UpdateInvoiceData = z.output<typeof updateInvoiceSchema>;

export type InvoiceTotals = Record<InvoiceWorkGroup, number> & { total: number };

/** Each group's sum and the total, in hryvnias, added up in kopecks (exact). */
export function invoiceTotals(works: { group: InvoiceWorkGroup; amount: number }[]): InvoiceTotals {
  const kopecks = { CONSTRUCTION: 0, TIE_IN: 0, WORK_PLAN: 0 };
  for (const work of works) kopecks[work.group] += toKopecks(work.amount);
  return {
    CONSTRUCTION: fromKopecks(kopecks.CONSTRUCTION),
    TIE_IN: fromKopecks(kopecks.TIE_IN),
    WORK_PLAN: fromKopecks(kopecks.WORK_PLAN),
    total: fromKopecks(kopecks.CONSTRUCTION + kopecks.TIE_IN + kopecks.WORK_PLAN),
  };
}

type Person = { id: string; fullName: string };

export type InvoiceDto = {
  id: string;
  applicationId: string;
  /** The project valid when the invoice was made. */
  projectId: string;
  invoiceNumber: string;
  invoiceDate: string;
  works: { group: InvoiceWorkGroup; name: string; amount: number }[];
  totals: InvoiceTotals;
  /** Working days from the project's approval (not counted) to the invoice's date. */
  workingDays: number;
  /** Working days past `INVOICE_DEADLINE_DAYS`; 0 when within it. */
  overdueBy: number;
  scan: ScanDto | null;
  basis: ScanDto | null;
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
