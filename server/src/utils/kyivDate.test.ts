import { describe, expect, it } from 'vitest';
import { kyivDayStart, kyivToday, nextIsoDate, toIsoDate } from './kyivDate';

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

describe('kyivDayStart', () => {
  it.each([
    ['2026-01-15', '2026-01-14T22:00:00.000Z'], // winter, UTC+2
    ['2026-07-15', '2026-07-14T21:00:00.000Z'], // summer, UTC+3
    ['2026-03-29', '2026-03-28T22:00:00.000Z'], // the day clocks go forward
    ['2026-10-25', '2026-10-24T21:00:00.000Z'], // the day clocks go back
  ])('%s starts at %s', (isoDate, expected) => {
    expect(kyivDayStart(isoDate).toISOString()).toBe(expected);
  });

  it('nextIsoDate crosses month and year ends', () => {
    expect(nextIsoDate('2026-02-28')).toBe('2026-03-01');
    expect(nextIsoDate('2026-12-31')).toBe('2027-01-01');
  });
});
