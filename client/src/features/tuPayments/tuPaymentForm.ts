import {
  kyivCalendarDate,
  saveTuPaymentSchema,
  type SaveTuPaymentInput,
  type TuPaymentDto,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';

// The version is not a field: the dialog adds the one it saw when saving.
export const formSchema = saveTuPaymentSchema;
export type FormInput = z.input<typeof formSchema>;
export type FormData = z.output<typeof formSchema>;

/** The saved payment as the fields show it, or a new invoice dated today. */
export function formDefaults(payment: TuPaymentDto | null): FormInput {
  return {
    invoiceNumber: payment?.invoiceNumber ?? '',
    invoiceDate: payment?.invoiceDate ?? kyivCalendarDate(),
    // As people write it: "1234,56".
    amount: payment ? payment.amount.toFixed(2).replace('.', ',') : '',
    paidDate: payment?.paidDate ?? '',
    actTransferredDate: payment?.actTransferredDate ?? '',
  };
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
  if (fields.length === 0) setError('root', { message: apiError.message });
}
