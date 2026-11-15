import { describe, expect, it } from 'vitest';
import { INITIAL_DEPARTMENTS } from './departments';
import { formatRegNumber, parseRegNumber } from './regNumber';

describe('initial departments', () => {
  it('keeps the agreed codes, Одеське being 8, with unique ids and codes', () => {
    expect(INITIAL_DEPARTMENTS.map((d) => `${d.code} ${d.name}`)).toEqual([
      '1 Арцизьке',
      '2 Ананьївське',
      '3 Березівське',
      '4 Болградське',
      '5 Іванівське',
      '6 Ізмаїльське',
      '7 Овідіопольське',
      '8 Одеське',
      '9 Одеське міжрайонне',
      '10 Подільське',
      '11 Ренійське',
      '12 Роздільнянське',
      '13 Ширяївське',
      '14 Чорноморське',
    ]);
    expect(new Set(INITIAL_DEPARTMENTS.map((d) => d.id)).size).toBe(14);
  });
});

describe('formatRegNumber', () => {
  it.each([
    [2026, 1, 8, '1т/26-8'],
    [2026, 15, 1, '15т/26-1'],
    [2027, 1234, 14, '1234т/27-14'],
    [2005, 7, 8, '7т/05-8'],
  ])('%i #%i code %i → %s', (year, seq, code, expected) => {
    expect(formatRegNumber(year, seq, code)).toBe(expected);
  });
});

describe('parseRegNumber', () => {
  it.each([
    ['15т/26-8', { year: 2026, seq: 15, departmentCode: 8 }],
    ['15т/26 - 14', { year: 2026, seq: 15, departmentCode: 14 }],
    ['15т/26-500', { year: 2026, seq: 15, departmentCode: 500 }],
    ['15т/26', { year: 2026, seq: 15 }],
    ['15Т/26', { year: 2026, seq: 15 }],
    ['15t/26-1', { year: 2026, seq: 15, departmentCode: 1 }],
    [' 15 т / 2026 ', { year: 2026, seq: 15 }],
    ['0015т/26-08', { year: 2026, seq: 15, departmentCode: 8 }],
  ])('accepts %j', (input, expected) => {
    expect(parseRegNumber(input)).toEqual(expected);
  });

  it.each([
    '',
    '15',
    '15/26',
    'т/26',
    '0т/26',
    '15т/1999',
    '15т/2100',
    '15т/6',
    'abc',
    '15т/26-0',
    '15т/26-',
  ])('rejects %j', (input) => {
    expect(parseRegNumber(input)).toBeNull();
  });

  it('round-trips with formatRegNumber', () => {
    expect(parseRegNumber(formatRegNumber(2026, 42, 11))).toEqual({
      year: 2026,
      seq: 42,
      departmentCode: 11,
    });
  });
});
