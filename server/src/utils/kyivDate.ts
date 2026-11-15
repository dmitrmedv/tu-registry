import { kyivCalendarDate } from '@tu-registry/shared';
import { clock } from './clock';

/** "YYYY-MM-DD" → Date at midnight UTC: the storage convention for registration dates. */
export function fromIsoDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Midnight-UTC date → "YYYY-MM-DD". */
export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in Kyiv, whatever the server's time zone. */
export function kyivToday(now: Date = clock.now()) {
  const iso = kyivCalendarDate(now);
  return { iso, year: Number(iso.slice(0, 4)), date: fromIsoDate(iso) };
}
