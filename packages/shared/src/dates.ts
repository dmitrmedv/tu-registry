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
export function kyivCalendarDate(now: Date = new Date()) {
  const parts = Object.fromEntries(kyivDateParts.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
