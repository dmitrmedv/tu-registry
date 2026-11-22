import { z } from 'zod';
import { CALENDAR_DAY_KINDS, type CalendarDayKind } from '../enums';

/** Deadlines in working days, counted from the registration date (stage 17.2). */
export const RESPONSE_DEADLINE_DAYS = 5;
export const TU_DEADLINE_DAYS = 10;
/** The invoice for the connection: from the project's approval date (agreed 2026-11-21). */
export const INVOICE_DEADLINE_DAYS = 10;

export const CALENDAR_DESCRIPTION_MAX = 200;

/** Saturday or Sunday of a "YYYY-MM-DD" calendar date, whatever the machine's time zone. */
export function isWeekendDate(isoDate: string) {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** A day is worked as the calendar's exception says; without one, Monday to Friday. */
export function isWorkingDate(isoDate: string, exception?: CalendarDayKind | null) {
  return exception ? exception === 'WORKING' : !isWeekendDate(isoDate);
}

/**
 * A document date on a day off (2026-11-22): refused by the server and shown at once in the
 * form, with the same words.
 */
export function dayOffMessage(isoDate: string) {
  return `Неробочий день за календарем (${isoDate.split('-').reverse().join('.')}) — оберіть робочий`;
}

/** An exception of the calendar as every user may read it, to check a date while it is typed. */
export type CalendarExceptionDto = { date: string; kind: CalendarDayKind };

/**
 * An exception must change something: a weekday off or a weekend day worked. Anything else
 * is what the calendar says anyway, and would only make the list harder to read.
 */
export function calendarKindError(isoDate: string, kind: CalendarDayKind) {
  const weekend = isWeekendDate(isoDate);
  if (kind === 'NON_WORKING' && weekend) return 'Субота й неділя — вихідні й так';
  if (kind === 'WORKING' && !weekend) return 'Будній день — робочий і так';
  return null;
}

const calendarDateField = z.iso.date('Вкажіть коректну дату');
const kindField = z.enum(CALENDAR_DAY_KINDS, 'Оберіть тип дня');
const descriptionField = z
  .string()
  .trim()
  .min(2, 'Опис: щонайменше 2 символи')
  .max(CALENDAR_DESCRIPTION_MAX, `Опис: не більше ${CALENDAR_DESCRIPTION_MAX} символів`);

export const createCalendarDaySchema = z
  .object({ date: calendarDateField, kind: kindField, description: descriptionField })
  .strict()
  .superRefine((data, ctx) => {
    const message = calendarKindError(data.date, data.kind);
    if (message) ctx.addIssue({ code: 'custom', path: ['kind'], message });
  });

/** The date is the key: to move an exception, delete it and add another. */
export const updateCalendarDaySchema = z
  .object({ kind: kindField, description: descriptionField })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'Немає змін для збереження');

export const calendarDateParamsSchema = z.object({ date: calendarDateField });

export const calendarYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2099),
});

export type CreateCalendarDayInput = z.input<typeof createCalendarDaySchema>;
export type UpdateCalendarDayInput = z.input<typeof updateCalendarDaySchema>;

export type CalendarDayDto = {
  date: string;
  kind: CalendarDayKind;
  description: string;
  /** Who added or last changed it, and when. */
  updatedBy: { id: string; fullName: string } | null;
  updatedAt: string;
};

/**
 * How a document stands against its deadline. `used`: working days from the registration date
 * (not counted) to the document's date, or to today while there is no document.
 */
export type DeadlineDto = {
  norm: number;
  used: number;
  /** norm − used; negative once overdue. */
  remaining: number;
  /** The last working day of the term. */
  dueDate: string;
  /** Working days past the term; 0 when within it. */
  overdueBy: number;
  /** The document exists (`used` counts to its date), or is still awaited (to today). */
  done: boolean;
};
