import { type CreateApplicationData, formatRegNumber } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { kyivToday, toIsoDate } from '../../utils/kyivDate';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { issueNextNumber, peekNextNumber } from '../numbering/numbering.service';
import { type ApplicationDocument, toApplicationDto } from './application.dto';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

type Actor = { id: string; fullName: string };

/**
 * A committed manual registration can take the very number the counter just issued
 * (unique index → E11000). Re-running the whole registration picks the next free one.
 */
const MAX_ATTEMPTS = 3;

function isDuplicateKey(error: unknown) {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

/** Registers an application with today's date (Kyiv) and the next number of the year. */
export async function createApplication(
  input: CreateApplicationData,
  actor: Actor,
  context: RequestContext,
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await registerAutomatically(input, actor, context);
    } catch (error) {
      if (isDuplicateKey(error) && attempt < MAX_ATTEMPTS) continue;
      throw error;
    }
  }
}

async function registerAutomatically(
  input: CreateApplicationData,
  actor: Actor,
  context: RequestContext,
) {
  const { year, date } = kyivToday();
  const session = await mongoose.startSession();
  try {
    let created: ApplicationDocument | undefined;
    // Everything below commits together or not at all, including the counter increment.
    await session.withTransaction(async () => {
      const regSeq = await issueNextNumber(year, session);
      [created] = await Application.create(
        [
          {
            ...input,
            regYear: year,
            regSeq,
            regDate: date,
            registrationMode: 'AUTO',
            createdBy: actor.id,
          },
        ],
        { session },
      );
      await ApplicationChange.create(
        [{ applicationId: created!._id, changedBy: actor.id, action: 'CREATED' }],
        { session },
      );
      await recordAudit(
        {
          action: 'APPLICATION_CREATED',
          actor: actor.id,
          entityType: 'Application',
          entityId: created!._id,
          // Only the number: customer data does not belong in the audit log.
          details: { regNumber: formatRegNumber(year, regSeq) },
        },
        context,
        session,
      );
    });
    return toApplicationDto(created!, { id: actor.id, fullName: actor.fullName });
  } finally {
    await session.endSession();
  }
}

export async function getNextNumber() {
  const { year, date } = kyivToday();
  const regSeq = await peekNextNumber(year);
  return {
    regNumber: formatRegNumber(year, regSeq),
    regYear: year,
    regSeq,
    regDate: toIsoDate(date),
  };
}
