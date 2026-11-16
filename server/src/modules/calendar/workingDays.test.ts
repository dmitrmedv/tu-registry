import { RESPONSE_DEADLINE_DAYS, TU_DEADLINE_DAYS } from '@tu-registry/shared';
import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  type CalendarExceptions,
  countWorkingDays,
  deadline,
  isWorkingDay,
} from './workingDays';

const none: CalendarExceptions = new Map();
// 2026-11-02 is a Monday.
const MONDAY = '2026-11-02';

describe('working days', () => {
  it('takes Saturday and Sunday off unless the administrator says otherwise', () => {
    expect(isWorkingDay('2026-11-06', none)).toBe(true); // Friday
    expect(isWorkingDay('2026-11-07', none)).toBe(false); // Saturday
    expect(isWorkingDay('2026-11-07', new Map([['2026-11-07', 'WORKING']]))).toBe(true);
    expect(isWorkingDay('2026-11-04', new Map([['2026-11-04', 'NON_WORKING']]))).toBe(false);
  });

  it('does not count the registration day, counts the document day', () => {
    // The example of the specification: registered 02.11, answered 06.11 → 4 of 5.
    expect(countWorkingDays(MONDAY, '2026-11-06', none)).toBe(4);
    expect(countWorkingDays(MONDAY, '2026-11-03', none)).toBe(1);
    expect(countWorkingDays(MONDAY, MONDAY, none)).toBe(0);
    expect(countWorkingDays(MONDAY, '2026-10-30', none)).toBe(0);
  });

  it('skips the weekend', () => {
    // Fri 06.11 → Mon 09.11: Saturday and Sunday are not counted.
    expect(countWorkingDays('2026-11-06', '2026-11-09', none)).toBe(1);
    expect(countWorkingDays(MONDAY, '2026-11-16', none)).toBe(10);
  });

  it('skips a day off added by the administrator, and the term moves by a day', () => {
    const holiday = new Map([['2026-11-04', 'NON_WORKING' as const]]);
    expect(countWorkingDays(MONDAY, '2026-11-06', holiday)).toBe(3);
    expect(addWorkingDays(MONDAY, RESPONSE_DEADLINE_DAYS, none)).toBe('2026-11-09');
    expect(addWorkingDays(MONDAY, RESPONSE_DEADLINE_DAYS, holiday)).toBe('2026-11-10');
  });

  it('counts a Saturday the administrator made a working day', () => {
    const saturday = new Map([['2026-11-07', 'WORKING' as const]]);
    expect(countWorkingDays(MONDAY, '2026-11-09', saturday)).toBe(6);
    expect(addWorkingDays(MONDAY, RESPONSE_DEADLINE_DAYS, saturday)).toBe('2026-11-07');
  });

  it('crosses the new year', () => {
    // Wed 30.12.2026 → Mon 04.01.2027: Thu, Fri, Mon.
    expect(countWorkingDays('2026-12-30', '2027-01-04', none)).toBe(3);
    expect(addWorkingDays('2026-12-30', 3, none)).toBe('2027-01-04');
  });
});

describe('deadline', () => {
  it('reports a response given in time: 4 working days of 5', () => {
    expect(
      deadline(
        {
          regDate: MONDAY,
          doneOn: '2026-11-06',
          norm: RESPONSE_DEADLINE_DAYS,
          today: '2026-11-20',
        },
        none,
      ),
    ).toEqual({
      norm: 5,
      used: 4,
      remaining: 1,
      dueDate: '2026-11-09',
      overdueBy: 0,
      done: true,
    });
  });

  it('keeps technical conditions on the last day in time, and the next day late', () => {
    const tu = (doneOn: string) =>
      deadline({ regDate: MONDAY, doneOn, norm: TU_DEADLINE_DAYS, today: '2026-12-01' }, none);
    expect(tu('2026-11-16')).toMatchObject({ used: 10, dueDate: '2026-11-16', overdueBy: 0 });
    expect(tu('2026-11-17')).toMatchObject({ used: 11, remaining: -1, overdueBy: 1 });
  });

  it('counts to today while the document is awaited', () => {
    expect(
      deadline(
        { regDate: MONDAY, doneOn: null, norm: TU_DEADLINE_DAYS, today: '2026-11-05' },
        none,
      ),
    ).toMatchObject({ used: 3, remaining: 7, overdueBy: 0, done: false });
  });

  it('works for a back-dated (manual) registration long overdue', () => {
    const result = deadline(
      { regDate: '2025-03-03', doneOn: null, norm: RESPONSE_DEADLINE_DAYS, today: MONDAY },
      none,
    );
    expect(result.dueDate).toBe('2025-03-10');
    expect(result.used).toBeGreaterThan(400);
    expect(result.overdueBy).toBe(result.used - 5);
  });
});
