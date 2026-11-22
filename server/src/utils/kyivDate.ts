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

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-03-12" → "2026-03-13". */
export function nextIsoDate(isoDate: string) {
  return toIsoDate(new Date(fromIsoDate(isoDate).getTime() + DAY_MS));
}

/** "2026-03-13" → "2026-03-12". */
export function previousIsoDate(isoDate: string) {
  return toIsoDate(new Date(fromIsoDate(isoDate).getTime() - DAY_MS));
}

/**
 * The UTC instant at which the Kyiv calendar day `isoDate` begins (UTC+2 in winter, UTC+3 in
 * summer). Used to filter timestamps such as audit entries by Kyiv days.
 */
export function kyivDayStart(isoDate: string) {
  const midnightUtc = fromIsoDate(isoDate).getTime();
  for (const offsetHours of [2, 3]) {
    const candidate = new Date(midnightUtc - offsetHours * 60 * 60 * 1000);
    const startsThatDay =
      kyivCalendarDate(candidate) === isoDate &&
      kyivCalendarDate(new Date(candidate.getTime() - 1)) !== isoDate;
    if (startsThatDay) return candidate;
  }
  throw new Error(`Cannot determine the start of ${isoDate} in Kyiv`);
}
