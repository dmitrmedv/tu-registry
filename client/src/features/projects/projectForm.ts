import {
  createProjectSchema,
  kyivCalendarDate,
  type ProjectDto,
  type UpdateProjectInput,
} from '@tu-registry/shared';
import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { toApiError } from '@/shared/api/apiError';
import { notifyError } from '@/shared/lib/notify';

// The form always sends the engineer (the TU's by default).
export const formSchema = createProjectSchema.extend({
  engineer: createProjectSchema.shape.engineer.unwrap(),
});
export type FormInput = z.input<typeof formSchema>;
export type FormData = z.output<typeof formSchema>;
type ServerErrorDetails = { fieldErrors?: Record<string, string[] | undefined> };

/** The saved project, or a new one by the engineer of the valid technical conditions. */
export function formDefaults(project?: ProjectDto, tuEngineerId?: string): FormInput {
  return {
    approvalNumber: project?.approvalNumber ?? '',
    designOrganization: project?.designOrganization ?? '',
    approvalDate: project?.approvalDate ?? kyivCalendarDate(),
    engineer: project?.engineer.id ?? tuEngineerId ?? '',
  };
}

/** Only what changed, with the version seen; null when nothing did. */
export function changedFields(project: ProjectDto, values: FormData): UpdateProjectInput | null {
  const current: FormData = {
    approvalNumber: project.approvalNumber,
    designOrganization: project.designOrganization,
    approvalDate: project.approvalDate,
    engineer: project.engineer.id,
  };
  const changed = (Object.keys(current) as (keyof FormData)[]).filter(
    (field) => values[field] !== current[field],
  );
  if (changed.length === 0) return null;
  return {
    version: project.version,
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
  if (fields.length === 0) notifyError(apiError.message);
}
