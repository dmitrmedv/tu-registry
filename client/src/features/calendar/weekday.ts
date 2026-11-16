const WEEKDAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** "2026-11-04" → "ср": the weekday of a calendar date, whatever the browser's time zone. */
export const weekdayOf = (isoDate: string) =>
  WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] ?? '';
