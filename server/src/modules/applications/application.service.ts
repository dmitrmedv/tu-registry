import {
  type ApplicationListItemDto,
  type ApplicationListQueryData,
  type AuditAction,
  type CreateApplicationData,
  formatRegNumber,
  type ManualApplicationData,
  type Paginated,
  type RegistrationMode,
} from '@tu-registry/shared';
import mongoose, { type ClientSession } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, kyivToday, toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { issueNextNumber, peekNextNumber } from '../numbering/numbering.service';
import { toApplicationDto } from './application.dto';
import { buildListFilter, LIST_SORTS } from './application.query';
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
  { fields, regYear, regSeq, regDate, mode }: Registration,
  actor: Actor,
  context: RequestContext,
) {
  const { objectCategoryOther, ...rest } = fields;
  const [created] = await Application.create(
    [
      {
        ...rest,
        // The wording belongs to OTHER only; a leftover from a switched category is dropped.
        ...(fields.objectCategory === 'OTHER' && { objectCategoryOther }),
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
      details: { regNumber: formatRegNumber(regYear, regSeq), regDate: toIsoDate(regDate) },
    },
    context,
    session,
  );
  return created!;
}

/** Registers an application with today's date (Kyiv) and the next number of the year. */
export async function createApplication(
  fields: CreateApplicationData,
  actor: Actor,
  context: RequestContext,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      const { year, date } = kyivToday();
      // The counter increment is part of the same transaction: no burnt numbers on failure.
      const created = await inTransaction(async (session) => {
        const regSeq = await issueNextNumber(year, session);
        return insertRegistration(
          session,
          { fields, regYear: year, regSeq, regDate: date, mode: 'AUTO' },
          actor,
          context,
        );
      });
      return toApplicationDto(created, actor);
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
  actor: Actor,
  context: RequestContext,
) {
  // The year is always the registration date's year: "14" on 2024-05-20 is "14т/24".
  const year = yearOf(regDate);
  const formatted = formatRegNumber(year, seq);
  try {
    const created = await inTransaction(async (session) => {
      // Only for a helpful message; the unique index is what actually prevents duplicates.
      const existing = await Application.findOne({ regYear: year, regSeq: seq })
        .select('regDate')
        .session(session);
      if (existing) throw numberTaken(formatted, existing.regDate);
      return insertRegistration(
        session,
        { fields, regYear: year, regSeq: seq, regDate: fromIsoDate(regDate), mode: 'MANUAL' },
        actor,
        context,
      );
    });
    return toApplicationDto(created, actor);
  } catch (error) {
    // A concurrent registration took the number between the check and the insert.
    if (isDuplicateKey(error)) throw numberTaken(formatted);
    throw error;
  }
}

/** Lets the form show "14т/24 — free/taken" while the user types. Read-only. */
export async function checkManualNumber(regDate: string, seq: number, excludeId?: string) {
  const year = yearOf(regDate);
  const existing = await Application.findOne({
    regYear: year,
    regSeq: seq,
    ...(excludeId && { _id: mongoose.trusted({ $ne: excludeId }) }),
  }).select('regDate');
  return {
    regNumber: formatRegNumber(year, seq),
    available: !existing,
    takenOn: existing ? toIsoDate(existing.regDate) : null,
  };
}

export async function getNextNumber() {
  const { year, iso } = kyivToday();
  const regSeq = await peekNextNumber(year);
  return { regNumber: formatRegNumber(year, regSeq), regYear: year, regSeq, regDate: iso };
}

type ListedApplication = {
  _id: mongoose.Types.ObjectId;
  regYear: number;
  regSeq: number;
  regDate: Date;
  customer: string;
  customerRepresentative?: string;
  settlement?: string;
  objectAddress: string;
  cadastralNumber?: string;
  objectType: ApplicationListItemDto['objectType'];
  objectCategory: ApplicationListItemDto['objectCategory'];
  objectCategoryOther?: string;
  registrationMode: ApplicationListItemDto['registrationMode'];
  status: ApplicationListItemDto['status'];
  createdBy: { _id: mongoose.Types.ObjectId; fullName: string } | null;
};

/** One page of the registry. Filtering, sorting and paging happen in the database. */
export async function listApplications(
  query: ApplicationListQueryData,
): Promise<Paginated<ApplicationListItemDto>> {
  const filter = buildListFilter(query);
  const [rows, total] = await Promise.all([
    Application.find(filter)
      .sort(LIST_SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select(
        'regYear regSeq regDate customer customerRepresentative settlement objectAddress cadastralNumber objectType objectCategory objectCategoryOther registrationMode status createdBy',
      )
      .populate('createdBy', 'fullName')
      .lean<ListedApplication[]>(),
    Application.countDocuments(filter),
  ]);

  return {
    data: rows.map((row) => ({
      id: String(row._id),
      regNumber: formatRegNumber(row.regYear, row.regSeq),
      regYear: row.regYear,
      regSeq: row.regSeq,
      regDate: toIsoDate(row.regDate),
      customer: row.customer,
      customerRepresentative: row.customerRepresentative ?? null,
      settlement: row.settlement ?? null,
      objectAddress: row.objectAddress,
      cadastralNumber: row.cadastralNumber ?? null,
      objectType: row.objectType,
      objectCategory: row.objectCategory,
      objectCategoryOther: row.objectCategoryOther ?? null,
      registrationMode: row.registrationMode,
      status: row.status,
      createdBy: row.createdBy
        ? { id: String(row.createdBy._id), fullName: row.createdBy.fullName }
        : { id: '', fullName: '—' },
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
