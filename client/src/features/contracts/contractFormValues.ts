import {
  type ContractDraftDto,
  type ContractDto,
  type SaveContractData,
  type SaveContractInput,
  saveContractSchema,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

export const formSchema = saveContractSchema;
export type FormInput = SaveContractInput;
export type FormData = SaveContractData;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/** A new contract starts from its draft; a saved one from itself. */
export function formDefaults(source: ContractDraftDto | ContractDto): FormInput {
  return {
    contractNumber: source.contractNumber ?? '',
    contractDate: source.contractDate ?? '',
    department: source.department,
    customer: source.customer,
    address: source.address,
    signedDate: 'signedDate' in source ? (source.signedDate ?? '') : '',
    representative: 'representative' in source ? (source.representative ?? '') : '',
    comment: 'comment' in source ? (source.comment ?? '') : '',
  };
}

/** Whether the saved contract differs from what the form holds. */
export function hasChanges(contract: ContractDto, values: FormData) {
  const saved = formSchema.parse(formDefaults(contract));
  return (Object.keys(saved) as (keyof FormData)[]).some((field) => saved[field] !== values[field]);
}

/** The server's refusal next to its fields, or as a notification. */
export function showServerError(error: unknown, setError: UseFormSetError<FormInput>) {
  const apiError = toApiError(error);
  const fieldErrors = (apiError.details as ServerErrorDetails | undefined)?.fieldErrors ?? {};
  const fields = Object.entries(fieldErrors);
  for (const [field, messages] of fields) {
    if (messages?.[0]) setError(field as FieldPath<FormInput>, { message: messages[0] });
  }
  if (fields.length === 0) notifyError(apiError.message);
}
