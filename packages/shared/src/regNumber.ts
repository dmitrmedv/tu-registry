import { type Department, DEPARTMENT_CODES, departmentByCode } from './departments';

/**
 * Registration number "15т/26-8": sequence 15 within year 2026 in the department with code 8.
 * Stored as regYear, regSeq and the department; this module is the only place that formats
 * or parses the string. Each department numbers its applications separately.
 */
export function formatRegNumber(year: number, seq: number, department: Department) {
  return `${seq}т/${String(year % 100).padStart(2, '0')}-${DEPARTMENT_CODES[department]}`;
}

// Accepts "15т/26-8", "15т/2026-8", "15т/26" (any department), Latin "t" (keyboard layout
// slip), any case, spaces and leading zeros.
const REG_NUMBER_PATTERN =
  /^\s*0*(\d{1,6})\s*[тТtT]\s*\/\s*(\d{4}|\d{2})\s*(?:-\s*0*(\d{1,3})\s*)?$/;

export function parseRegNumber(
  input: string,
): { year: number; seq: number; department?: Department } | null {
  const match = REG_NUMBER_PATTERN.exec(input);
  if (!match) return null;
  const seq = Number(match[1]);
  const yearPart = match[2]!;
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  if (seq < 1 || year < 2000 || year > 2099) return null;
  if (match[3] === undefined) return { year, seq };
  const department = departmentByCode(Number(match[3]));
  return department ? { year, seq, department } : null;
}
