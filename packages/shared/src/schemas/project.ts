import { z } from 'zod';
import type { ScanDto } from '../scan';
import type { PreviousScanDto } from './response';

/**
 * «Проєкт» (agreed 2026-11-21): the approval of the connection project, made under the valid
 * technical conditions. One valid project per application: a new one only after the previous is
 * cancelled. Besides the project's scan (earlier ones kept), its «Кошторис»: the date the
 * estimate was checked, the estimate's scan and the check file in IMD format.
 */
export const PROJECT_APPROVAL_NUMBER_MAX = 50;

/** The estimate's files as they appear in the API path: its scan and the IMD check file. */
export const PROJECT_FILE_KINDS = ['estimateScan', 'estimateImd'] as const;
export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];

/** IMD has no registered type: browsers send it as a generic binary file. */
export const IMD_MIME_TYPE = 'application/octet-stream';

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
    estimateCheckDate: dateField.nullable().optional(),
  })
  .strict();

/** `estimateCheckDate: null` clears the date. */
export const updateProjectSchema = z
  .object({
    version: versionField,
    approvalNumber: approvalNumberField.optional(),
    approvalDate: dateField.optional(),
    engineer: engineerField.optional(),
    estimateCheckDate: dateField.nullable().optional(),
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
  estimateCheckDate: string | null;
  estimateScan: ScanDto | null;
  estimateImd: ScanDto | null;
  cancellation: { reason: string; at: string; by: Person } | null;
  createdBy: Person;
  createdAt: string;
  version: number;
};
