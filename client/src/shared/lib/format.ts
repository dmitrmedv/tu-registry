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

/** Ukrainian plural: pluralUk(4, ['день', 'дні', 'днів']) → 'дні'. */
export function pluralUk(n: number, [one, few, many]: readonly [string, string, string]) {
  const abs = Math.abs(n);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** "1 робочий день", "4 робочі дні", "5 робочих днів". */
export const workingDaysLabel = (n: number) =>
  `${n} ${pluralUk(n, ['робочий день', 'робочі дні', 'робочих днів'])}`;
