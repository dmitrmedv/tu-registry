import { describe, expect, it } from 'vitest';
import {
  calendarYearQuerySchema,
  createCalendarDaySchema,
  isWeekendDate,
  updateCalendarDaySchema,
} from './calendar';

describe('calendar schemas', () => {
  it.each([
    ['2026-11-07', true], // Saturday
    ['2026-11-08', true], // Sunday
    ['2026-11-09', false], // Monday
  ])('%s is a weekend day: %s', (date, weekend) => {
    expect(isWeekendDate(date)).toBe(weekend);
  });

  it('accepts a weekday off and a weekend day worked', () => {
    expect(
      createCalendarDaySchema.parse({
        date: '2026-08-24',
        kind: 'NON_WORKING',
        description: ' День Незалежності ',
      }),
    ).toEqual({ date: '2026-08-24', kind: 'NON_WORKING', description: 'День Незалежності' });
    expect(
      createCalendarDaySchema.safeParse({
        date: '2026-11-07',
        kind: 'WORKING',
        description: 'Відпрацювання',
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ date: '2026-11-07', kind: 'NON_WORKING' }, 'Субота й неділя — вихідні й так'],
    [{ date: '2026-11-09', kind: 'WORKING' }, 'Будній день — робочий і так'],
  ])('refuses an exception that changes nothing: %j', (input, message) => {
    const result = createCalendarDaySchema.safeParse({ ...input, description: 'Опис' });
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['kind'], message })]);
  });

  it.each([
    { date: '2026-02-30', kind: 'WORKING', description: 'Опис' },
    { date: '2026-11-09', kind: 'HOLIDAY', description: 'Опис' },
    { date: '2026-11-09', kind: 'NON_WORKING', description: '' },
  ])('rejects %j', (input) => {
    expect(createCalendarDaySchema.safeParse(input).success).toBe(false);
  });

  it('changes the type or the description, never the date', () => {
    expect(updateCalendarDaySchema.parse({ description: 'Новий опис' })).toEqual({
      description: 'Новий опис',
    });
    expect(updateCalendarDaySchema.safeParse({}).success).toBe(false);
    expect(updateCalendarDaySchema.safeParse({ date: '2026-11-10' }).success).toBe(false);
  });

  it('reads the year from the query', () => {
    expect(calendarYearQuerySchema.parse({ year: '2026' })).toEqual({ year: 2026 });
    expect(calendarYearQuerySchema.safeParse({ year: 'abc' }).success).toBe(false);
  });
});
