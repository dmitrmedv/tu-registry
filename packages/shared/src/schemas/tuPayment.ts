import { z } from 'zod';
import type { ScanDto } from '../scan';

/**
 * Payment for technical conditions (agreed 2026-11-19): one per set of TU. Accounting issues
 * the invoice; the user enters it, then the payment date with the receipt, then the act of
 * work done and the day it went to accounting. Filled over time in one form.
 */
export const TU_INVOICE_NUMBER_MAX = 50;
/** Hryvnias; far above any real invoice, a guard against typos. */
export const TU_PAYMENT_AMOUNT_MAX = 100_000_000;

/** The two scans a payment may have, as they appear in the API path. */
export const TU_PAYMENT_SCAN_KINDS = ['receipt', 'act'] as const;
export type TuPaymentScanKind = (typeof TU_PAYMENT_SCAN_KINDS)[number];

const versionField = z.number('Відсутня версія документа').int().min(1);
const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const optionalDate = z.preprocess(emptyToNull, z.iso.date('Вкажіть коректну дату').nullable());

/** Hryvnias with up to two decimals; the form sends "1 234,56", an API client 1234.56. */
const amountField = z.preprocess(
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
    actTransferredDate: optionalDate.default(null),
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
    if (data.actTransferredDate && !data.paidDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['actTransferredDate'],
        message: 'Спершу вкажіть дату оплати',
      });
    }
    if (data.actTransferredDate && data.paidDate && data.actTransferredDate < data.paidDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['actTransferredDate'],
        message: 'Дата передачі не може бути раніше дати оплати',
      });
    }
  });

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
  actTransferredDate: string | null;
  receiptScan: ScanDto | null;
  actScan: ScanDto | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
