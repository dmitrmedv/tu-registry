/**
 * Registration number "15т/26-8": sequence 15 within year 2026 in the department with code 8.
 * Stored as regYear, regSeq and the department's id; the code comes from the department at
 * the time of display. This module is the only place that formats or parses the string.
 */
export function formatRegNumber(year: number, seq: number, departmentCode: number) {
  return `${seq}т/${String(year % 100).padStart(2, '0')}-${departmentCode}`;
}

// Accepts "15т/26-8", "15т/2026-8", "15т/26" (any department), Latin "t" (keyboard layout
// slip), any case, spaces and leading zeros.
const REG_NUMBER_PATTERN =
  /^\s*0*(\d{1,6})\s*[тТtT]\s*\/\s*(\d{4}|\d{2})\s*(?:-\s*0*(\d{1,3})\s*)?$/;

export function parseRegNumber(
  input: string,
): { year: number; seq: number; departmentCode?: number } | null {
  const match = REG_NUMBER_PATTERN.exec(input);
  if (!match) return null;
  const seq = Number(match[1]);
  const yearPart = match[2]!;
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  if (seq < 1 || year < 2000 || year > 2099) return null;
  if (match[3] === undefined) return { year, seq };
  const departmentCode = Number(match[3]);
  return departmentCode >= 1 ? { year, seq, departmentCode } : null;
}

export type RegNumberSearch = { seq: number; year?: number; departmentCode?: number };

// A number as it is being typed: "5", "5т", "5т/", "5т/2", "5т/26", "5т/26-", "5т/26-8". The
// year counts only once complete (2 or 4 digits), the department code only after a year.
const REG_NUMBER_SEARCH_PATTERN =
  /^0*(\d{1,6})(?:\s*[тТtT](?:\s*\/\s*(\d{0,4})(?:\s*-\s*0*(\d{0,3}))?)?)?$/;

/**
 * A number as people search for it: "15" or "15т" — number 15 in any year, "15т/26" — in any
 * department, "15т/26-8" — that exact number. A part still being typed ("15т/2") is left out
 * rather than making the whole text "not a number". Null when the text is not a number.
 */
export function parseRegNumberSearch(input: string): RegNumberSearch | null {
  const match = REG_NUMBER_SEARCH_PATTERN.exec(input.trim());
  if (!match) return null;
  const seq = Number(match[1]);
  if (seq < 1) return null;
  const yearPart = match[2] ?? '';
  if (yearPart.length !== 2 && yearPart.length !== 4) return { seq };
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  if (year < 2000 || year > 2099) return { seq };
  if (!match[3]) return { seq, year };
  const departmentCode = Number(match[3]);
  return departmentCode >= 1 ? { seq, year, departmentCode } : { seq, year };
}
