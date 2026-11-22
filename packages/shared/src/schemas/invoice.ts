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
export const INVOICE_AGREEMENT_MAX = 999;
export const INVOICE_COMMENT_MAX = 2000;

/**
 * The groups of works, in the order shown; `EARTHWORKS` — «Дозволи на земляні роботи» (mock-up
 * of 2026-11-22): the geodesy, the permit and anything else, entered by hand.
 */
export const INVOICE_WORK_GROUPS = ['CONSTRUCTION', 'TIE_IN', 'WORK_PLAN', 'EARTHWORKS'] as const;
export type InvoiceWorkGroup = (typeof INVOICE_WORK_GROUPS)[number];

/**
 * The earthworks permits (the geodesy among them) only where the pipeline is connected
 * underground (2026-11-22).
 */
export const EARTHWORKS_CONNECTION_POINT = 'UNDERGROUND';
export const GEODESY_WORK = 'Нанесення геодезії';

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

/** «б/н»: an invoice whose number the accounts department has not given yet. */
export const INVOICE_NO_NUMBER = 'б/н';

/** «№ 6442/1», or «б/н» while there is no number yet. */
export const invoiceNumberText = (invoiceNumber: string | null) =>
  invoiceNumber ? `№ ${invoiceNumber}` : INVOICE_NO_NUMBER;

const blankToNull = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value;

const fields = {
  /** Given by the accounts department later (2026-11-22): empty until then. */
  invoiceNumber: z
    .preprocess(
      blankToNull,
      z
        .string('Вкажіть № рахунку')
        .trim()
        .max(INVOICE_NUMBER_MAX, `№ рахунку: не більше ${INVOICE_NUMBER_MAX} символів`)
        .nullable(),
    )
    .default(null),
  /**
   * The additional agreement the invoice becomes (mock-up of 2026-11-22): 1 by default, the next
   * one when that number is taken.
   */
  agreementNumber: z.preprocess(
    (value) =>
      typeof value === 'string' ? (value.trim() === '' ? undefined : Number(value.trim())) : value,
    z
      .number('Вкажіть № додаткової угоди')
      .int('№ додаткової угоди — ціле число')
      .min(1, '№ додаткової угоди — від 1')
      .max(INVOICE_AGREEMENT_MAX, `№ додаткової угоди — до ${INVOICE_AGREEMENT_MAX}`),
  ),
  invoiceDate: z.iso.date('Вкажіть коректну дату'),
  /** Optional, as in the contract (2026-11-22). */
  comment: z
    .preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .max(INVOICE_COMMENT_MAX, `Коментар: не більше ${INVOICE_COMMENT_MAX} символів`)
        .nullable(),
    )
    .default(null),
  works: z
    .array(invoiceWorkSchema.extend({ group: z.enum(INVOICE_WORK_GROUPS, 'Оберіть групу робіт') }))
    .min(1, 'Додайте хоча б одну роботу')
    .max(INVOICE_WORKS_MAX, `Не більше ${INVOICE_WORKS_MAX} робіт`),
};

/** The term of an invoice dated `date` under a project (2026-11-22). */
export const invoiceTermQuerySchema = z
  .object({ date: z.iso.date('Вкажіть коректну дату') })
  .strict();
export type InvoiceTermQuery = z.infer<typeof invoiceTermQuerySchema>;

/**
 * Working days from the project's approval to `date`, both counted as in Excel; the calendar is
 * the administrator's, so the server counts them.
 */
export type InvoiceTermDto = { workingDays: number; norm: number; overdueBy: number };

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
  const kopecks = Object.fromEntries(INVOICE_WORK_GROUPS.map((group) => [group, 0])) as Record<
    InvoiceWorkGroup,
    number
  >;
  for (const work of works) kopecks[work.group] += toKopecks(work.amount);
  const sums = INVOICE_WORK_GROUPS.map((group) => [group, fromKopecks(kopecks[group])] as const);
  const total = INVOICE_WORK_GROUPS.reduce((sum, group) => sum + kopecks[group], 0);
  return {
    ...(Object.fromEntries(sums) as Record<InvoiceWorkGroup, number>),
    total: fromKopecks(total),
  };
}

type Person = { id: string; fullName: string };

export type InvoiceDto = {
  id: string;
  applicationId: string;
  /** The project valid when the invoice was made. */
  projectId: string;
  /** None until the accounts department gives it. */
  invoiceNumber: string | null;
  /** None in the invoices entered before the field (2026-11-22). */
  agreementNumber: number | null;
  invoiceDate: string;
  comment: string | null;
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
