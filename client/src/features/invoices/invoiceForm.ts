import {
  createInvoiceSchema,
  type InvoiceDto,
  type InvoiceWorkGroup,
  kyivCalendarDate,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { formatAmountInput } from '@/features/tuPayments';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

export const formSchema = createInvoiceSchema;
export type FormData = z.output<typeof formSchema>;
/** Sums stay as typed («1 234,56») until the schema turns them into numbers. */
export type FormInput = z.input<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/**
 * The names offered in each group, from the Excel calculation of 2026-11-21; any other name
 * may be typed.
 */
export const WORK_SUGGESTIONS: Record<InvoiceWorkGroup, string[]> = {
  CONSTRUCTION: ['Будівельно-монтажні роботи за кошторисом'],
  TIE_IN: ['Врізання'],
  WORK_PLAN: [
    'Витрати газу',
    'Встановлення/зняття тимчасових заглушок',
    'Позачерговий техогляд та обслуговування станцій катодного захисту',
    'Пуск та наладка ШРП',
    'Відновлення газопостачання',
    'Нанесення геодезії',
  ],
};

export function formDefaults(invoice?: InvoiceDto): FormInput {
  return {
    invoiceNumber: invoice?.invoiceNumber ?? '',
    invoiceDate: invoice?.invoiceDate ?? kyivCalendarDate(),
    works: invoice
      ? invoice.works.map((work) => ({ ...work, amount: formatAmountInput(work.amount) }))
      : [],
  };
}

/** A sum as typed, for the running totals; 0 until it is one. */
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
