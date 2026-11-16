import {
  type CalendarDayDto,
  type CalendarDayKind,
  calendarKindError,
  type CreateCalendarDayInput,
  type UpdateCalendarDayInput,
} from '@tu-registry/shared';
import mongoose, { type Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { kyivToday } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { CalendarDay } from './calendarDay.model';
import { type CalendarExceptions, deadline } from './workingDays';

type Actor = { id: string };
type CalendarDayDoc = {
  _id: string;
  kind: CalendarDayKind;
  description: string;
  updatedBy: { _id: Types.ObjectId; fullName: string } | null;
  updatedAt: Date;
};

const toDto = (day: CalendarDayDoc): CalendarDayDto => ({
  date: day._id,
  kind: day.kind,
  description: day.description,
  updatedBy: day.updatedBy
    ? { id: String(day.updatedBy._id), fullName: day.updatedBy.fullName }
    : null,
  updatedAt: day.updatedAt.toISOString(),
});

const findDay = (date: string) =>
  CalendarDay.findById(date).populate('updatedBy', 'fullName').lean<CalendarDayDoc>();

const dayNotFound = () => ApiError.notFound('Такої дати в календарі немає');

function fieldError(field: string, message: string, status = 400) {
  return new ApiError(status, status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR', message, {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

export async function listCalendarDays(year: number) {
  // Ids are "YYYY-MM-DD", so a year is a string range; our own operators, hence trusted.
  const rows = await CalendarDay.find({
    _id: mongoose.trusted({ $gte: `${year}-01-01`, $lte: `${year}-12-31` }),
  })
    .sort({ _id: 1 })
    .populate('updatedBy', 'fullName')
    .lean<CalendarDayDoc[]>();
  return rows.map(toDto);
}

export async function createCalendarDay(
  input: CreateCalendarDayInput,
  actor: Actor,
  context: RequestContext,
) {
  const { date, kind, description } = input as {
    date: string;
    kind: CalendarDayKind;
    description: string;
  };
  try {
    await CalendarDay.create({
      _id: date,
      kind,
      description,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw fieldError('date', 'Ця дата вже є в календарі', 409);
    throw error;
  }
  await recordAudit(
    {
      action: 'CALENDAR_DAY_CREATED',
      actor: actor.id,
      entityType: 'CalendarDay',
      entityId: date,
      details: { date, kind, description },
    },
    context,
  );
  return toDto((await findDay(date))!);
}

export async function updateCalendarDay(
  date: string,
  input: UpdateCalendarDayInput,
  actor: Actor,
  context: RequestContext,
) {
  const day = await CalendarDay.findById(date);
  if (!day) throw dayNotFound();
  const next = input as { kind?: CalendarDayKind; description?: string };
  const kindError = next.kind && calendarKindError(date, next.kind);
  if (kindError) throw fieldError('kind', kindError);

  const changes = (['kind', 'description'] as const)
    .filter((field) => next[field] !== undefined && next[field] !== day[field])
    .map((field) => ({ field, from: day[field], to: next[field] }));
  if (changes.length > 0) {
    day.set({ ...Object.fromEntries(changes.map((c) => [c.field, c.to])), updatedBy: actor.id });
    await day.save();
    await recordAudit(
      {
        action: 'CALENDAR_DAY_UPDATED',
        actor: actor.id,
        entityType: 'CalendarDay',
        entityId: date,
        details: { date, changes },
      },
      context,
    );
  }
  return toDto((await findDay(date))!);
}

/** The entry goes; what it was stays in the audit log. */
export async function deleteCalendarDay(date: string, actor: Actor, context: RequestContext) {
  const day = await CalendarDay.findOneAndDelete({ _id: date }).lean();
  if (!day) throw dayNotFound();
  await recordAudit(
    {
      action: 'CALENDAR_DAY_DELETED',
      actor: actor.id,
      entityType: 'CalendarDay',
      entityId: date,
      details: { date, kind: day.kind, description: day.description },
    },
    context,
  );
}

/** Every exception after `from`: a few dozen a year, so no upper bound is needed. */
export async function loadExceptions(from: string): Promise<CalendarExceptions> {
  const rows = await CalendarDay.find({ _id: mongoose.trusted({ $gt: from }) })
    .select('kind')
    .lean<{ _id: string; kind: CalendarDayKind }[]>();
  return new Map(rows.map((row) => [row._id, row.kind]));
}

/**
 * A document's deadline by the current calendar and today's Kyiv date. All deadlines are
 * computed here, so every user sees the same numbers.
 */
export async function documentDeadline(regDate: string, doneOn: string | null, norm: number) {
  return deadline({ regDate, doneOn, norm, today: kyivToday().iso }, await loadExceptions(regDate));
}
