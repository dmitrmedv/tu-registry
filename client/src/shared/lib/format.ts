const dateTimeFormat = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "15.11.2026, 10:22" in Kyiv time; an em dash for missing values. */
export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

/**
 * Calendar date "2026-03-12" → "12.03.2026". Pure string work on purpose: going through
 * Date would shift the day in time zones west of UTC.
 */
export function formatCalendarDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}
