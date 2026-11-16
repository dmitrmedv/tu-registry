import {
  type AuditAction,
  type CreateApplicationData,
  type Department,
  formatRegNumber,
  type ManualApplicationData,
  type RegistrationMode,
} from '@tu-registry/shared';
import mongoose, { type ClientSession } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, kyivToday, toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { departmentCode } from '../departments/department.service';
import { issueNextNumber, peekNextNumber } from '../numbering/numbering.service';
import { toApplicationDto } from './application.dto';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

type Actor = { id: string; fullName: string };

/**
 * A committed manual registration can take the very number the counter just issued
 * (unique index → E11000). Re-running the whole registration picks the next free one.
 */
const MAX_AUTO_ATTEMPTS = 3;

type Registration = {
  fields: CreateApplicationData;
  /** Already checked by the caller (see registrationDepartment). */
  department: Department;
  /** The department's code, for the number. */
  code: number;
  regYear: number;
  regSeq: number;
  regDate: Date;
  mode: RegistrationMode;
};

/**
 * The common part of every registration, inside the caller's transaction: the application,
 * its CREATED history entry and the audit entry are committed together or not at all.
 */
async function insertRegistration(
  session: ClientSession,
  { fields, department, code, regYear, regSeq, regDate, mode }: Registration,
  actor: Actor,
  context: RequestContext,
) {
  const { objectCategoryOther, department: _requested, ...rest } = fields;
  const [created] = await Application.create(
    [
      {
        ...rest,
        // The wording belongs to OTHER only; a leftover from a switched category is dropped.
        ...(fields.objectCategory === 'OTHER' && { objectCategoryOther }),
        department,
        regYear,
        regSeq,
        regDate,
        registrationMode: mode,
        createdBy: actor.id,
      },
    ],
    { session },
  );
  await ApplicationChange.create(
    [{ applicationId: created!._id, changedBy: actor.id, action: 'CREATED' }],
    { session },
  );
  const action: AuditAction =
    mode === 'MANUAL' ? 'APPLICATION_MANUAL_CREATED' : 'APPLICATION_CREATED';
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'Application',
      entityId: created!._id,
      // Number and date only: customer data does not belong in the audit log.
      details: {
        regNumber: formatRegNumber(regYear, regSeq, code),
        regDate: toIsoDate(regDate),
      },
    },
    context,
    session,
  );
  return created!;
}

/** Today's date (Kyiv) and the next number of the year in the department. */
export async function createApplication(
  fields: CreateApplicationData,
  department: Department,
  actor: Actor,
  context: RequestContext,
) {
  const code = await departmentCode(department);
  for (let attempt = 1; ; attempt++) {
    try {
      const { year, date } = kyivToday();
      // The counter increment is part of the same transaction: no burnt numbers on failure.
      const created = await inTransaction(async (session) => {
        const regSeq = await issueNextNumber(year, department, session);
        return insertRegistration(
          session,
          { fields, department, code, regYear: year, regSeq, regDate: date, mode: 'AUTO' },
          actor,
          context,
        );
      });
      return toApplicationDto(created, code, { author: actor });
    } catch (error) {
      if (isDuplicateKey(error) && attempt < MAX_AUTO_ATTEMPTS) continue;
      throw error;
    }
  }
}

export const yearOf = (isoDate: string) => Number(isoDate.slice(0, 4));

export function numberTaken(regNumber: string, takenOn?: Date) {
  const by = takenOn ? ` (заява від ${toIsoDate(takenOn).split('-').reverse().join('.')})` : '';
  return new ApiError(409, 'REG_NUMBER_TAKEN', `Номер ${regNumber} уже зайнятий${by}`, {
    field: 'regNumber',
  });
}

/**
 * Back-dated registration with a user-supplied date and number. The automatic counter is
 * never touched: the automatic sequence simply skips numbers taken here.
 */
export async function createManualApplication(
  { regDate, regSeq: seq, ...fields }: ManualApplicationData,
  department: Department,
  actor: Actor,
  context: RequestContext,
) {
  // The year is always the registration date's year: "14" on 2024-05-20 is "14т/24".
  const year = yearOf(regDate);
  const code = await departmentCode(department);
  const formatted = formatRegNumber(year, seq, code);
  try {
    const created = await inTransaction(async (session) => {
      // Only for a helpful message; the unique index is what actually prevents duplicates.
      const existing = await Application.findOne({
        department,
        regYear: year,
        regSeq: seq,
      })
        .select('regDate')
        .session(session);
      if (existing) throw numberTaken(formatted, existing.regDate);
      return insertRegistration(
        session,
        {
          fields,
          department,
          code,
          regYear: year,
          regSeq: seq,
          regDate: fromIsoDate(regDate),
          mode: 'MANUAL',
        },
        actor,
        context,
      );
    });
    return toApplicationDto(created, code, { author: actor });
  } catch (error) {
    // A concurrent registration took the number between the check and the insert.
    if (isDuplicateKey(error)) throw numberTaken(formatted);
    throw error;
  }
}

/** Lets the form show "14т/24-8 — free/taken" while the user types. Read-only. */
export async function checkManualNumber(
  regDate: string,
  seq: number,
  department: Department,
  excludeId?: string,
) {
  const year = yearOf(regDate);
  const existing = await Application.findOne({
    department,
    regYear: year,
    regSeq: seq,
    ...(excludeId && { _id: mongoose.trusted({ $ne: excludeId }) }),
  }).select('regDate');
  return {
    regNumber: formatRegNumber(year, seq, await departmentCode(department)),
    available: !existing,
    takenOn: existing ? toIsoDate(existing.regDate) : null,
  };
}

export async function getNextNumber(department: Department) {
  const { year, iso } = kyivToday();
  const regSeq = await peekNextNumber(year, department);
  return {
    regNumber: formatRegNumber(year, regSeq, await departmentCode(department)),
    regYear: year,
    regSeq,
    regDate: iso,
  };
}
