import { describe, expect, it } from 'vitest';
import { DEPARTMENT_CODES, DEPARTMENT_NAMES, DEPARTMENTS } from './departments';
import { formatRegNumber, parseRegNumber } from './regNumber';

describe('departments', () => {
  it('numbers the departments in the agreed order, Одеське being 8', () => {
    expect(DEPARTMENTS.map((d) => `${DEPARTMENT_CODES[d]} ${DEPARTMENT_NAMES[d]}`)).toEqual([
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
  });
});

describe('formatRegNumber', () => {
  it.each([
    [2026, 1, 'ODESA', '1т/26-8'],
    [2026, 15, 'ARTSYZ', '15т/26-1'],
    [2027, 1234, 'CHORNOMORSK', '1234т/27-14'],
    [2005, 7, 'ODESA', '7т/05-8'],
  ] as const)('%i #%i %s → %s', (year, seq, department, expected) => {
    expect(formatRegNumber(year, seq, department)).toBe(expected);
  });
});

describe('parseRegNumber', () => {
  it.each([
    ['15т/26-8', { year: 2026, seq: 15, department: 'ODESA' }],
    ['15т/26 - 14', { year: 2026, seq: 15, department: 'CHORNOMORSK' }],
    ['15т/26', { year: 2026, seq: 15 }],
    ['15Т/26', { year: 2026, seq: 15 }],
    ['15t/26-1', { year: 2026, seq: 15, department: 'ARTSYZ' }],
    [' 15 т / 2026 ', { year: 2026, seq: 15 }],
    ['0015т/26-08', { year: 2026, seq: 15, department: 'ODESA' }],
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
    '15т/26-15', // no department with this code
    '15т/26-',
  ])('rejects %j', (input) => {
    expect(parseRegNumber(input)).toBeNull();
  });

  it('round-trips with formatRegNumber', () => {
    expect(parseRegNumber(formatRegNumber(2026, 42, 'RENI'))).toEqual({
      year: 2026,
      seq: 42,
      department: 'RENI',
    });
  });
});
