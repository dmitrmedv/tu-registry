import { z } from 'zod';
import { MONTH_PATTERN } from '../dates';
import type { ScanDto } from '../scan';

/**
 * Payment for technical conditions (agreed 2026-11-19): one per set of TU. Accounting issues
 * the invoice; the user enters it, then the payment date with the receipt, then the act of
 * work done and the month it went to accounting (a month, not a day: agreed 2026-11-19).
 * Filled over time in one form.
 */
export const TU_INVOICE_NUMBER_MAX = 50;
/** Hryvnias; far above any real invoice, a guard against typos. */
export const TU_PAYMENT_AMOUNT_MAX = 100_000_000;

/**
 * The files of a payment, as they appear in the API path: PDF scans of the invoice (since
 * 2026-11-19), the receipt, the act and the signed contract, and the contract as a Word
 * document (`contractDocument`, DOCX; the contract since 2026-11-20).
 */
export const TU_PAYMENT_SCAN_KINDS = [
  'invoice',
  'receipt',
  'act',
  'contract',
  'contractDocument',
] as const;
/** The largest contract number: a guard against typos. */
export const TU_PAYMENT_CONTRACT_NUMBER_MAX = 999_999;
export type TuPaymentScanKind = (typeof TU_PAYMENT_SCAN_KINDS)[number];

const versionField = z.number('Відсутня версія документа').int().min(1);
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const optionalDate = z.preprocess(emptyToNull, z.iso.date('Вкажіть коректну дату').nullable());
const optionalMonth = z.preprocess(
  emptyToNull,
  z.string().regex(MONTH_PATTERN, 'Вкажіть місяць і рік').nullable(),
);

/** Hryvnias with up to two decimals; the form sends "1 234,56", an API client 1234.56. */
export const amountField = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() !== ''
      ? Number(value.replace(/\s/g, '').replace(',', '.'))
      : value,
  z
    .number('Вкажіть суму числом')
    .positive('Сума має бути більшою за нуль')
    .max(TU_PAYMENT_AMOUNT_MAX, 'Перевірте суму: вона завелика')
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      'Не більше двох знаків після коми',
    ),
);

/**
 * Saves the whole form: without `version` it adds the payment, with it changes the one seen.
 * Dates go in the order things happen; the act goes to accounting only after the payment.
 */
export const saveTuPaymentSchema = z
  .object({
    version: versionField.optional(),
    invoiceNumber: z
      .string('Вкажіть номер рахунку')
      .trim()
      .min(1, 'Вкажіть номер рахунку')
      .max(TU_INVOICE_NUMBER_MAX, `Номер: не більше ${TU_INVOICE_NUMBER_MAX} символів`),
    invoiceDate: z.iso.date('Вкажіть дату рахунку'),
    amount: amountField,
    paidDate: optionalDate.default(null),
    /**
     * What the bank actually took (2026-11-19): after its rounding it may differ from the
     * invoice. Only together with the payment date; payments entered before may lack it.
     */
    paidAmount: z.preprocess(emptyToNull, amountField.nullable()).default(null),
    actTransferMonth: optionalMonth.default(null),
    /**
     * The contract for the payment (2026-11-20), rarely needed: numbered 1, 2, 3… per
     * department, the next one offered by the form; kept only together with its date.
     */
    contractNumber: z
      .preprocess((value) => {
        const empty = emptyToNull(value);
        return typeof empty === 'string' ? Number(empty.trim()) : empty;
      }, z.number('Вкажіть номер договору числом').int('Вкажіть номер договору цілим числом').min(1, 'Номер договору — від 1').max(TU_PAYMENT_CONTRACT_NUMBER_MAX, 'Перевірте номер договору: він завеликий').nullable())
      .default(null),
    contractDate: optionalDate.default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.paidDate && data.paidDate < data.invoiceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['paidDate'],
        message: 'Дата оплати не може бути раніше дати рахунку',
      });
    }
    if (data.paidAmount !== null && !data.paidDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['paidAmount'],
        message: 'Вкажіть і дату оплати',
      });
    }
    if (data.contractDate && data.contractNumber === null) {
      ctx.addIssue({ code: 'custom', path: ['contractNumber'], message: 'Вкажіть номер договору' });
    }
    if (data.actTransferMonth && !data.paidDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['actTransferMonth'],
        message: 'Спершу вкажіть дату оплати',
      });
    }
    if (
      data.actTransferMonth &&
      data.paidDate &&
      data.actTransferMonth < data.paidDate.slice(0, 7)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['actTransferMonth'],
        message: 'Місяць передачі не може бути раніше місяця оплати',
      });
    }
  })
  // The form offers the next number on every invoice, and a contract is rare: without its date
  // the number is not kept, so a payment without a contract takes no number (2026-11-20).
  .transform((data) => (data.contractDate ? data : { ...data, contractNumber: null }));

export type SaveTuPaymentInput = z.input<typeof saveTuPaymentSchema>;
export type SaveTuPaymentData = z.output<typeof saveTuPaymentSchema>;

/** Stored in kopecks: whole numbers add up exactly. */
export const toKopecks = (hryvnias: number) => Math.round(hryvnias * 100);
export const fromKopecks = (kopecks: number) => kopecks / 100;

/** 1234.5 → «1 234,50 грн». */
export const formatHryvnias = (amount: number) =>
  `${amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;

type Person = { id: string; fullName: string };

export type TuPaymentDto = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  /** Hryvnias. */
  amount: number;
  paidDate: string | null;
  /** Hryvnias actually paid; null until entered. */
  paidAmount: number | null;
  /** "YYYY-MM". */
  actTransferMonth: string | null;
  invoiceScan: ScanDto | null;
  receiptScan: ScanDto | null;
  actScan: ScanDto | null;
  /** The contract for the payment: its number and date, or null for both. */
  contractNumber: number | null;
  contractDate: string | null;
  /** The signed contract's scan. */
  contractScan: ScanDto | null;
  /** The contract as a Word document. */
  contractDocument: ScanDto | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
