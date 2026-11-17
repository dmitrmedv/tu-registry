import {
  type ApplicationDto,
  createTechnicalConditionsSchema,
  fullAddress,
  kyivCalendarDate,
  type TechnicalConditionsDto,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';

// The API takes the application's customer and address when they are missing; the form always
// sends them, filled in from the application.
export const formSchema = createTechnicalConditionsSchema.required({
  customer: true,
  address: true,
});
export type FormInput = z.input<typeof formSchema>;
export type FormData = z.output<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/** The form's starting values: the saved set, or the application's customer and address. */
export function formDefaults(app: ApplicationDto, tu?: TechnicalConditionsDto): Partial<FormInput> {
  return {
    tuNumber: tu?.tuNumber ?? '',
    preparedDate: tu?.preparedDate ?? kyivCalendarDate(),
    customer: tu?.customer ?? app.customer,
    address: tu?.address ?? fullAddress(app.settlement, app.objectAddress),
    engineer: tu?.engineer.id ?? '',
    // As people write it: "2,5".
    gasFlow: tu ? String(tu.gasFlow).replace('.', ',') : '',
    connectionType: tu?.connectionType,
    gasPressure: tu?.gasPressure,
    connectionPoint: tu?.connectionPoint,
  };
}

/** Only what changed, with the version seen; null when nothing did. */
export function changedFields(tu: TechnicalConditionsDto, values: FormData) {
  const current: FormData = {
    tuNumber: tu.tuNumber,
    preparedDate: tu.preparedDate,
    customer: tu.customer,
    address: tu.address,
    engineer: tu.engineer.id,
    gasFlow: tu.gasFlow,
    connectionType: tu.connectionType,
    gasPressure: tu.gasPressure,
    connectionPoint: tu.connectionPoint,
  };
  const changed = (Object.keys(current) as (keyof FormData)[]).filter(
    (field) => values[field] !== current[field],
  );
  if (changed.length === 0) return null;
  return {
    version: tu.version,
    ...Object.fromEntries(changed.map((field) => [field, values[field]])),
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
  if (fields.length === 0) setError('root', { message: apiError.message });
}
