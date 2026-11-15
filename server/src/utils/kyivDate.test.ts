import { describe, expect, it } from 'vitest';
import { kyivToday, toIsoDate } from './kyivDate';

describe('kyivToday', () => {
  it.each([
    // Winter time: Kyiv = UTC+2
    ['2026-12-31T21:59:00Z', 2026, '2026-12-31'],
    ['2026-12-31T22:01:00Z', 2027, '2027-01-01'],
    // Summer time: Kyiv = UTC+3
    ['2026-06-14T20:59:00Z', 2026, '2026-06-14'],
    ['2026-06-14T21:01:00Z', 2026, '2026-06-15'],
  ])('%s UTC is %s in Kyiv', (utc, year, isoDate) => {
    const today = kyivToday(new Date(utc));

    expect(today.year).toBe(year);
    expect(toIsoDate(today.date)).toBe(isoDate);
    expect(today.date.getUTCHours()).toBe(0);
  });
});
