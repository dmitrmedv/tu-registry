import { type CalendarDayKind, type DeadlineDto, isWorkingDate } from '@tu-registry/shared';
import { nextIsoDate } from '../../utils/kyivDate';

/** The administrator's exceptions by date ("YYYY-MM-DD"). */
export type CalendarExceptions = ReadonlyMap<string, CalendarDayKind>;

/** An exception decides; otherwise Saturday and Sunday are off. */
export function isWorkingDay(isoDate: string, exceptions: CalendarExceptions) {
  return isWorkingDate(isoDate, exceptions.get(isoDate));
}

/**
 * Working days after `from` up to and including `to`: the registration day itself is not
 * counted, the document's day is. 0 when `to` is not after `from`.
 */
export function countWorkingDays(from: string, to: string, exceptions: CalendarExceptions) {
  let count = 0;
  for (let day = nextIsoDate(from); day <= to; day = nextIsoDate(day)) {
    if (isWorkingDay(day, exceptions)) count += 1;
  }
  return count;
}

/**
 * Working days from `from` to `to` with both counted, as Excel's NETWORKDAYS: the invoice's
 * term from the project's approval (2026-11-22) — approved and invoiced on the same working day
 * is 1 working day (0 calendar days). 0 when `to` is before `from`.
 */
export function countWorkingDaysInclusive(
  from: string,
  to: string,
  exceptions: CalendarExceptions,
) {
  if (to < from) return 0;
  return (isWorkingDay(from, exceptions) ? 1 : 0) + countWorkingDays(from, to, exceptions);
}

/** The `n`-th working day after `from`: the last day of an n-working-day term. */
export function addWorkingDays(from: string, n: number, exceptions: CalendarExceptions) {
  let day = from;
  for (let counted = 0; counted < n;) {
    day = nextIsoDate(day);
    if (isWorkingDay(day, exceptions)) counted += 1;
  }
  return day;
}

/**
 * A document's deadline: counted from the registration date to the document's date, or to
 * `today` while it is awaited. A document dated on the last day of the term is in time.
 */
export function deadline(
  input: { regDate: string; doneOn: string | null; norm: number; today: string },
  exceptions: CalendarExceptions,
): DeadlineDto {
  const used = countWorkingDays(input.regDate, input.doneOn ?? input.today, exceptions);
  return {
    norm: input.norm,
    used,
    remaining: input.norm - used,
    dueDate: addWorkingDays(input.regDate, input.norm, exceptions),
    overdueBy: Math.max(0, used - input.norm),
    done: input.doneOn !== null,
  };
}
