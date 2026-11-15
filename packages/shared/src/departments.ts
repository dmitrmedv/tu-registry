/**
 * Regional departments (управління). The id is stored in users and applications and never
 * changes; the code goes into the registration number ("15т/26-8"). Codes are provisional
 * (the position in the list, agreed 2026-11-16): changing one here renumbers every
 * application of that department in the UI, nothing in the database changes.
 */
export const DEPARTMENTS = [
  'ARTSYZ',
  'ANANIV',
  'BEREZIVKA',
  'BOLHRAD',
  'IVANIVKA',
  'IZMAIL',
  'OVIDIOPOL',
  'ODESA',
  'ODESA_INTERDISTRICT',
  'PODILSK',
  'RENI',
  'ROZDILNA',
  'SHYRIAIEVE',
  'CHORNOMORSK',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_NAMES: Record<Department, string> = {
  ARTSYZ: 'Арцизьке',
  ANANIV: 'Ананьївське',
  BEREZIVKA: 'Березівське',
  BOLHRAD: 'Болградське',
  IVANIVKA: 'Іванівське',
  IZMAIL: 'Ізмаїльське',
  OVIDIOPOL: 'Овідіопольське',
  ODESA: 'Одеське',
  ODESA_INTERDISTRICT: 'Одеське міжрайонне',
  PODILSK: 'Подільське',
  RENI: 'Ренійське',
  ROZDILNA: 'Роздільнянське',
  SHYRIAIEVE: 'Ширяївське',
  CHORNOMORSK: 'Чорноморське',
};

export const DEPARTMENT_CODES = Object.fromEntries(
  DEPARTMENTS.map((department, index) => [department, index + 1]),
) as Record<Department, number>;

export function departmentByCode(code: number): Department | undefined {
  return DEPARTMENTS.find((department) => DEPARTMENT_CODES[department] === code);
}

/** Existing users and applications were assigned to it (stage 13); the admin's default filter. */
export const DEFAULT_DEPARTMENT: Department = 'ODESA';
