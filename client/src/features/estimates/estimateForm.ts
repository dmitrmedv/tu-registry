import { createEstimateSchema, type EstimateDto } from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { formatAmountInput } from '@/features/tuPayments';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

export const formSchema = createEstimateSchema;
export type FormInput = z.input<typeof formSchema>;
export type FormData = z.output<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/** The saved estimate; a new one (or a recalculation) starts empty. */
export function formDefaults(estimate?: EstimateDto): FormInput {
  return {
    checkDate: estimate?.checkDate ?? '',
    amount: estimate?.amount ? formatAmountInput(estimate.amount) : '',
  };
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
