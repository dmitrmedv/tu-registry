/**
 * Registration number "15т/26": sequence 15 within year 2026. Stored as two integers
 * (regYear, regSeq); this module is the only place that formats or parses the string.
 */

export function formatRegNumber(year: number, seq: number) {
  return `${seq}т/${String(year % 100).padStart(2, '0')}`;
}

// Accepts "15т/26", "15т/2026", Latin "t" (keyboard layout slip), any case, spaces, leading zeros.
const REG_NUMBER_PATTERN = /^\s*0*(\d{1,6})\s*[тТtT]\s*\/\s*(\d{4}|\d{2})\s*$/;

export function parseRegNumber(input: string): { year: number; seq: number } | null {
  const match = REG_NUMBER_PATTERN.exec(input);
  if (!match) return null;
  const seq = Number(match[1]);
  const yearPart = match[2]!;
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  if (seq < 1 || year < 2000 || year > 2099) return null;
  return { year, seq };
}
