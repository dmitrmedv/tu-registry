import {
  createInvoiceSchema,
  type CreateInvoiceData,
  GEODESY_WORK,
  INVOICE_WORKS_MAX,
  type InvoiceDto,
  type InvoiceWorkGroup,
  invoiceWorkSchema,
  kyivCalendarDate,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { formatAmountInput } from '@/features/tuPayments';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

const worksField = z
  .array(invoiceWorkSchema)
  .max(INVOICE_WORKS_MAX, `Не більше ${INVOICE_WORKS_MAX} робіт`);

/**
 * The form of the mock-up of 2026-11-22: the additional agreement's number, then three lists of
 * works, each added with «＋ Додати роботу» — construction with the tie-in, the work plan (ПВР)
 * and the earthworks permits; `toInput` turns them into the works the API takes.
 */
export const formSchema = z
  .object({
    invoiceNumber: createInvoiceSchema.shape.invoiceNumber,
    agreementNumber: createInvoiceSchema.shape.agreementNumber,
    invoiceDate: createInvoiceSchema.shape.invoiceDate,
    comment: createInvoiceSchema.shape.comment,
    works: worksField,
    workPlan: worksField,
    earthworks: worksField,
  })
  .refine((form) => form.works.length + form.workPlan.length + form.earthworks.length > 0, {
    message: 'Додайте хоча б одну роботу',
    path: ['works'],
  });
export type FormData = z.output<typeof formSchema>;
/** Sums stay as typed («1 234,56») until the schema turns them into numbers. */
export type FormInput = z.input<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

const TIE_IN = 'Врізання';

/** The names offered in the first list: construction and the tie-in. */
/** Chosen, it takes the current estimate's sum by default (2026-11-22). */
export const CONSTRUCTION_BY_ESTIMATE = 'Будівельно-монтажні роботи за кошторисом';

export const isByEstimate = (name: string) =>
  name.trim().toLocaleLowerCase('uk') === CONSTRUCTION_BY_ESTIMATE.toLocaleLowerCase('uk');

export const CONSTRUCTION_SUGGESTIONS = [CONSTRUCTION_BY_ESTIMATE, TIE_IN];

/** The names offered for the work plan, from the Excel calculation of 2026-11-21. */
export const WORK_PLAN_SUGGESTIONS = [
  'Витрати газу',
  'Встановлення/зняття тимчасових заглушок',
  'Позачерговий техогляд та обслуговування СКЗ',
  'Пуск та наладка ШРП',
  'Відновлення газопостачання',
];

/** The names offered for the earthworks permits; the geodesy only where it is underground. */
export const EARTHWORKS_SUGGESTIONS = [GEODESY_WORK, 'Отримання дозволу на земляні роботи'];

/** The group of a work of the first list by its name: any other name is construction. */
export function groupOf(name: string): 'CONSTRUCTION' | 'TIE_IN' {
  return name.trim().toLocaleLowerCase('uk') === TIE_IN.toLocaleLowerCase('uk')
    ? 'TIE_IN'
    : 'CONSTRUCTION';
}

const typedWork = (work: { name: string; amount: number }) => ({
  name: work.name,
  amount: formatAmountInput(work.amount),
});

/** The next additional agreement after those of the valid invoices: 1 for the first. */
export function nextAgreementNumber(invoices: InvoiceDto[]) {
  return (
    Math.max(
      0,
      ...invoices
        .filter((invoice) => !invoice.cancellation)
        .map((invoice) => invoice.agreementNumber ?? 0),
    ) + 1
  );
}

/**
 * The next invoice number after the valid invoices' plain numbers (2026-11-22): 1 for the first.
 * A number such as «6442/1» is not counted; the field may still be changed or cleared.
 */
export function nextInvoiceNumber(invoices: InvoiceDto[]) {
  const numbers = invoices
    .filter((invoice) => !invoice.cancellation && /^\d+$/.test(invoice.invoiceNumber ?? ''))
    .map((invoice) => Number(invoice.invoiceNumber));
  return String(Math.max(0, ...numbers) + 1);
}

/** The saved invoice, or a new one without works (2026-11-22) under the next agreement and number. */
export function formDefaults(
  invoice: InvoiceDto | undefined,
  nextAgreement: number,
  nextNumber = '',
): FormInput {
  const of = (...groups: InvoiceWorkGroup[]) =>
    (invoice?.works ?? []).filter((work) => groups.includes(work.group)).map(typedWork);
  return {
    invoiceNumber: invoice ? (invoice.invoiceNumber ?? '') : nextNumber,
    agreementNumber: String(invoice?.agreementNumber ?? nextAgreement),
    invoiceDate: invoice?.invoiceDate ?? kyivCalendarDate(),
    comment: invoice?.comment ?? '',
    works: of('CONSTRUCTION', 'TIE_IN'),
    workPlan: of('WORK_PLAN'),
    earthworks: of('EARTHWORKS'),
  };
}

/** The works the API takes: the first list by the names' groups, then the other two. */
export function toInput(values: FormData): CreateInvoiceData {
  return {
    invoiceNumber: values.invoiceNumber,
    agreementNumber: values.agreementNumber,
    invoiceDate: values.invoiceDate,
    comment: values.comment,
    works: [
      ...values.works.map((work) => ({ ...work, group: groupOf(work.name) })),
      ...values.workPlan.map((work) => ({ ...work, group: 'WORK_PLAN' as const })),
      ...values.earthworks.map((work) => ({ ...work, group: 'EARTHWORKS' as const })),
    ],
  };
}

/** A sum as typed, for the running total; 0 until it is one. */
export function typedAmount(typed: unknown) {
  const value = Number(
    String(typed ?? '')
      .replace(/\s/g, '')
      .replace(',', '.'),
  );
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** The server's refusal next to its fields, or above the form. */
export function showServerError(error: unknown, setError: UseFormSetError<FormInput>) {
  const apiError = toApiError(error);
  const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
  const fields = Object.entries(fieldErrors);
  for (const [field, messages] of fields) {
    if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
  }
  if (fields.length === 0) notifyError(apiError.message);
}
