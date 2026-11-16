import { z } from 'zod';
import { type Department, departmentField } from '../departments';
import { fullNameField } from './user';

/**
 * Engineers who prepare technical conditions and responses (stage 17.1). Each department has
 * its own: an engineer is never moved to another one. Deactivated, never deleted — documents
 * keep referring to them.
 */
export const createEngineerSchema = z
  .object({ fullName: fullNameField, department: departmentField })
  .strict();

/** The department is fixed at creation; only the name and the status change. */
export const updateEngineerSchema = z
  .object({ fullName: fullNameField, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Немає змін для збереження');

const booleanFlag = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.enum(['true', 'false']).optional(),
);

/** `department` narrows an admin's list; a user always gets their own department's. */
export const engineerListQuerySchema = z.object({
  department: z.preprocess((v) => (v === '' ? undefined : v), departmentField.optional()),
  active: booleanFlag,
});

export type CreateEngineerInput = z.input<typeof createEngineerSchema>;
export type UpdateEngineerInput = z.input<typeof updateEngineerSchema>;
export type EngineerListQuery = z.input<typeof engineerListQuerySchema>;

export type EngineerDto = {
  id: string;
  fullName: string;
  department: Department;
  isActive: boolean;
};
