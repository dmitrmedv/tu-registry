import { describe, expect, it } from 'vitest';
import { formatMonth, kyivCalendarDate } from './dates';

describe('kyivCalendarDate', () => {
  it.each([
    ['2026-12-31T21:59:00Z', '2026-12-31'],
    ['2026-12-31T22:01:00Z', '2027-01-01'],
    ['2026-06-14T21:01:00Z', '2026-06-15'],
  ])('%s UTC → %s in Kyiv', (utc, expected) => {
    expect(kyivCalendarDate(new Date(utc))).toBe(expected);
  });
});

describe('formatMonth', () => {
  it('names the month as people say it', () => {
    expect(formatMonth('2026-11')).toBe('листопад 2026');
    expect(formatMonth('2027-01')).toBe('січень 2027');
    expect(formatMonth('2026-13')).toBe('2026-13');
  });
});
