const kyivDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Calendar date in Kyiv as "YYYY-MM-DD", independent of the machine's time zone.
 * The same implementation runs on the server (authoritative) and in the browser (hints).
 */
const MONTH_NAMES = [
  'січень',
  'лютий',
  'березень',
  'квітень',
  'травень',
  'червень',
  'липень',
  'серпень',
  'вересень',
  'жовтень',
  'листопад',
  'грудень',
];

/** A calendar month as "YYYY-MM" (what <input type="month"> gives). */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-11" → «листопад 2026»; anything else as it is. */
export function formatMonth(month: string) {
  if (!MONTH_PATTERN.test(month)) return month;
  const [year, number] = month.split('-');
  return `${MONTH_NAMES[Number(number) - 1]} ${year}`;
}

export function kyivCalendarDate(now: Date = new Date()) {
  const parts = Object.fromEntries(kyivDateParts.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
