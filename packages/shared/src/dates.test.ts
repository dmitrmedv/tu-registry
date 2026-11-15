import { describe, expect, it } from 'vitest';
import { kyivCalendarDate } from './dates';

describe('kyivCalendarDate', () => {
  it.each([
    ['2026-12-31T21:59:00Z', '2026-12-31'],
    ['2026-12-31T22:01:00Z', '2027-01-01'],
    ['2026-06-14T21:01:00Z', '2026-06-15'],
  ])('%s UTC → %s in Kyiv', (utc, expected) => {
    expect(kyivCalendarDate(new Date(utc))).toBe(expected);
  });
});
