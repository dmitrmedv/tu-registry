import { z } from 'zod';
import type { ScanDto } from '../scan';
import type { PreviousScanDto } from './response';

/**
 * «Проєкт» (agreed 2026-11-21): the approval of the connection project, made under the valid
 * technical conditions. One valid project per application: a new one only after the previous is
 * cancelled. Its scan is kept with the earlier ones. The estimate is a document of its own
 * (`estimate.ts`): recalculated without the project being approved again.
 */
export const PROJECT_APPROVAL_NUMBER_MAX = 50;

const approvalNumberField = z
  .string('Вкажіть № узгодження')
  .trim()
  .min(1, 'Вкажіть № узгодження')
  .max(
    PROJECT_APPROVAL_NUMBER_MAX,
    `№ узгодження: не більше ${PROJECT_APPROVAL_NUMBER_MAX} символів`,
  );
const dateField = z.iso.date('Вкажіть коректну дату');
const engineerField = z.string('Оберіть виконавця').regex(/^[a-f\d]{24}$/i, 'Оберіть виконавця');
const versionField = z.number('Відсутня версія документа').int().min(1);

/** Without the engineer the server takes the valid technical conditions' one. */
export const createProjectSchema = z
  .object({
    approvalNumber: approvalNumberField,
    approvalDate: dateField,
    engineer: engineerField.optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    version: versionField,
    approvalNumber: approvalNumberField.optional(),
    approvalDate: dateField.optional(),
    engineer: engineerField.optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).some((key) => key !== 'version'),
    'Немає змін для збереження',
  );

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectData = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type UpdateProjectData = z.output<typeof updateProjectSchema>;

type Person = { id: string; fullName: string };

export type ProjectDto = {
  id: string;
  applicationId: string;
  /** The technical conditions valid when the project was entered. */
  technicalConditionsId: string;
  approvalNumber: string;
  approvalDate: string;
  engineer: Person;
  scan: ScanDto | null;
  previousScans: PreviousScanDto[];
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
