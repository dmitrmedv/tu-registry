import {
  kyivCalendarDate,
  saveTuPaymentSchema,
  type SaveTuPaymentInput,
  type TuPaymentDto,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

// The version is not a field: the dialog adds the one it saw when saving.
export const formSchema = saveTuPaymentSchema;
export type FormInput = z.input<typeof formSchema>;
export type FormData = z.output<typeof formSchema>;

/** The saved payment as the fields show it, or a new invoice dated today. */
export function formDefaults(payment: TuPaymentDto | null): FormInput {
  return {
    invoiceNumber: payment?.invoiceNumber ?? '',
    invoiceDate: payment?.invoiceDate ?? kyivCalendarDate(),
    amount: payment ? formatAmountInput(payment.amount) : '',
    paidDate: payment?.paidDate ?? '',
    actTransferMonth: payment?.actTransferMonth ?? '',
  };
}

/** 2750 → «2 750,00»: thousands apart, as sums are shown everywhere (2026-11-19). */
export const formatAmountInput = (amount: number) =>
  amount.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * What was typed, tidied up the same way once the field is left: «2750» → «2 750,00». Left
 * as typed when it is not a sum in kopecks, so the error names the problem.
 */
export function tidyAmount(typed: string) {
  const value = Number(typed.replace(/\s/g, '').replace(',', '.'));
  const inKopecks = Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
  return typed.trim() !== '' && Number.isFinite(value) && value > 0 && inKopecks
    ? formatAmountInput(value)
    : typed;
}

export const toInput = (values: FormData, payment: TuPaymentDto | null): SaveTuPaymentInput => ({
  ...values,
  version: payment?.version,
});

type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

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
