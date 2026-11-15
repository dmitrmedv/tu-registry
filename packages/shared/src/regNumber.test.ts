import { describe, expect, it } from 'vitest';
import { formatRegNumber, parseRegNumber } from './regNumber';

describe('formatRegNumber', () => {
  it.each([
    [2026, 1, '1т/26'],
    [2026, 15, '15т/26'],
    [2027, 1234, '1234т/27'],
    [2005, 7, '7т/05'],
  ])('%i #%i → %s', (year, seq, expected) => {
    expect(formatRegNumber(year, seq)).toBe(expected);
  });
});

describe('parseRegNumber', () => {
  it.each([
    ['15т/26', { year: 2026, seq: 15 }],
    ['15Т/26', { year: 2026, seq: 15 }],
    ['15t/26', { year: 2026, seq: 15 }],
    [' 15 т / 2026 ', { year: 2026, seq: 15 }],
    ['0015т/26', { year: 2026, seq: 15 }],
  ])('accepts %j', (input, expected) => {
    expect(parseRegNumber(input)).toEqual(expected);
  });

  it.each(['', '15', '15/26', 'т/26', '0т/26', '15т/1999', '15т/2100', '15т/6', 'abc'])(
    'rejects %j',
    (input) => {
      expect(parseRegNumber(input)).toBeNull();
    },
  );

  it('round-trips with formatRegNumber', () => {
    expect(parseRegNumber(formatRegNumber(2026, 42))).toEqual({ year: 2026, seq: 42 });
  });
});
