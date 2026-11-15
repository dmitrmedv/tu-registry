import { z } from 'zod';

/**
 * Regional departments (управління) live in the database since stage 14.2: an admin adds,
 * renames, re-codes, archives and deletes them. A department's id is stored in users and
 * applications and never changes; its code goes into the registration number ("15т/26-8"),
 * so changing a code renumbers that department's applications in the UI only.
 */
export type Department = string;

export const DEPARTMENT_ID_PATTERN = /^[A-Za-z0-9_]{1,40}$/;
export const DEPARTMENT_NAME_MAX = 100;
export const DEPARTMENT_CODE_MAX = 999;

/** The departments that existed before they became editable; `db:migrate` adds them. */
export const INITIAL_DEPARTMENTS: readonly { id: Department; name: string; code: number }[] = [
  { id: 'ARTSYZ', name: 'Арцизьке', code: 1 },
  { id: 'ANANIV', name: 'Ананьївське', code: 2 },
  { id: 'BEREZIVKA', name: 'Березівське', code: 3 },
  { id: 'BOLHRAD', name: 'Болградське', code: 4 },
  { id: 'IVANIVKA', name: 'Іванівське', code: 5 },
  { id: 'IZMAIL', name: 'Ізмаїльське', code: 6 },
  { id: 'OVIDIOPOL', name: 'Овідіопольське', code: 7 },
  { id: 'ODESA', name: 'Одеське', code: 8 },
  { id: 'ODESA_INTERDISTRICT', name: 'Одеське міжрайонне', code: 9 },
  { id: 'PODILSK', name: 'Подільське', code: 10 },
  { id: 'RENI', name: 'Ренійське', code: 11 },
  { id: 'ROZDILNA', name: 'Роздільнянське', code: 12 },
  { id: 'SHYRIAIEVE', name: 'Ширяївське', code: 13 },
  { id: 'CHORNOMORSK', name: 'Чорноморське', code: 14 },
];

/** Existing users and applications were assigned to it (stage 13); the admin's default filter. */
export const DEFAULT_DEPARTMENT: Department = 'ODESA';

/** A department reference in a request. Whether it exists (and is not archived) is the server's call. */
export const departmentField = z
  .string('Оберіть управління')
  .trim()
  .min(1, 'Оберіть управління')
  .regex(DEPARTMENT_ID_PATTERN, 'Некоректне управління');

const departmentName = z
  .string()
  .trim()
  .min(2, 'Назва: щонайменше 2 символи')
  .max(DEPARTMENT_NAME_MAX, `Назва: не більше ${DEPARTMENT_NAME_MAX} символів`);

/** The form sends a string, an API client may send a number. */
const departmentCode = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  z
    .number('Вкажіть код (ціле число)')
    .int('Код — ціле число')
    .min(1, 'Код має бути більшим за нуль')
    .max(DEPARTMENT_CODE_MAX, `Код не може перевищувати ${DEPARTMENT_CODE_MAX}`),
);

export const createDepartmentSchema = z
  .object({ name: departmentName, code: departmentCode })
  .strict();

export const updateDepartmentSchema = createDepartmentSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Немає змін для збереження');

export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.input<typeof updateDepartmentSchema>;

export const departmentIdParamsSchema = z.object({ id: departmentField });

export type DepartmentDto = { id: Department; name: string; code: number; archived: boolean };

/** What the admin's departments page shows: archiving vs deleting depends on these counts. */
export type DepartmentAdminDto = DepartmentDto & { usersCount: number; applicationsCount: number };
