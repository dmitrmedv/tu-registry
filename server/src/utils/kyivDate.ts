import { clock } from './clock';

const kyivDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's calendar date in Kyiv, whatever the server's time zone. `date` is midnight UTC of
 * that calendar date — the storage convention for registration dates.
 */
export function kyivToday(now: Date = clock.now()) {
  const parts = Object.fromEntries(kyivDateParts.formatToParts(now).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const date = new Date(Date.UTC(year, Number(parts.month) - 1, Number(parts.day)));
  return { year, date };
}

/** Midnight-UTC date → "YYYY-MM-DD". */
export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
