import {
  type ProcessingDto,
  RESPONSE_DEADLINE_DAYS,
  type TimelineEventDto,
  type TimelineEventType,
  TU_DEADLINE_DAYS,
} from '@tu-registry/shared';
import { kyivToday, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import { loadApplication } from '../applications/application.edit.service';
import { loadExceptions } from '../calendar/calendar.service';
import { countWorkingDays, deadline } from '../calendar/workingDays';
import { regNumberOf } from '../documents/document.rules';
import { ApplicationResponse } from '../responses/response.model';
import type { ResponseRecord } from '../responses/response.service';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import type { TechnicalConditionsRecord } from '../technicalConditions/technicalConditions.service';
import { findUserSummaries } from '../users/user.service';
import { deadlinesTracked } from './deadlinesTracked';
import { byResponseOrder, stageOf } from './processing.summary';

/** Events of one day: registration, then responses, the documents they asked for, then TU. */
const TYPE_ORDER: Record<TimelineEventType, number> = {
  REGISTERED: 0,
  RESPONSE: 1,
  DOCUMENTS_RECEIVED: 2,
  TECHNICAL_CONDITIONS: 3,
};

/**
 * The processing of a visible application: its stage, its deadlines and the timeline of what
 * happened. Every number is computed here, by the current calendar, so all users see the same.
 */
export async function getProcessing(applicationId: string, actor: Actor): Promise<ProcessingDto> {
  const app = await loadApplication(applicationId, actor);
  const regDate = toIsoDate(app.regDate);
  const [responses, tus, exceptions, regNumber, names] = await Promise.all([
    ApplicationResponse.find({ applicationId: app._id }).lean<ResponseRecord[]>(),
    TechnicalConditions.find({ applicationId: app._id }).lean<TechnicalConditionsRecord[]>(),
    loadExceptions(regDate),
    regNumberOf(app),
    findUserSummaries([String(app.createdBy)]),
  ]);
  const days = (date: Date) => countWorkingDays(regDate, toIsoDate(date), exceptions);
  const inForce = responses.filter((r) => !r.cancellation).sort(byResponseOrder);
  const validTu = tus.find((tu) => !tu.cancellation) ?? null;
  const today = kyivToday().iso;

  const event = (
    type: TimelineEventType,
    date: Date,
    fields: Partial<TimelineEventDto> & { createdAt: Date },
  ) => {
    const { createdAt, ...rest } = fields;
    return {
      createdAt,
      dto: {
        type,
        date: toIsoDate(date),
        number: null,
        person: null,
        documentId: null,
        scanName: null,
        workingDays: days(date),
        norm: null,
        overdueBy: 0,
        sinceDocumentsReceived: null,
        cancelled: false,
        ...rest,
      } satisfies TimelineEventDto,
    };
  };
  const withNorm = (date: Date, norm: number) => ({
    norm,
    overdueBy: Math.max(0, days(date) - norm),
  });
  // The last time documents came before `date`, among responses in force.
  const documentsCameBefore = (date: Date) =>
    inForce
      .map((r) => r.documentsReceivedAt)
      .filter((received): received is Date => !!received && received <= date)
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);

  const events = [
    event('REGISTERED', app.regDate, {
      number: regNumber,
      person: names.get(String(app.createdBy))?.fullName ?? null,
      createdAt: app.get('createdAt') as Date,
    }),
    ...responses.flatMap((r) => [
      event('RESPONSE', r.responseDate, {
        number: r.outgoingNumber,
        person: r.engineerName,
        documentId: String(r._id),
        scanName: r.scan?.name ?? null,
        cancelled: !!r.cancellation,
        createdAt: r.createdAt,
        ...withNorm(r.responseDate, RESPONSE_DEADLINE_DAYS),
      }),
      ...(r.documentsReceivedAt
        ? [
            event('DOCUMENTS_RECEIVED', r.documentsReceivedAt, {
              documentId: String(r._id),
              cancelled: !!r.cancellation,
              createdAt: r.createdAt,
            }),
          ]
        : []),
    ]),
    ...tus.map((tu) => {
      const received = documentsCameBefore(tu.preparedDate);
      return event('TECHNICAL_CONDITIONS', tu.preparedDate, {
        number: tu.tuNumber,
        person: tu.engineerName,
        documentId: String(tu._id),
        scanName: tu.scan?.name ?? null,
        cancelled: !!tu.cancellation,
        createdAt: tu.createdAt,
        sinceDocumentsReceived: received
          ? countWorkingDays(toIsoDate(received), toIsoDate(tu.preparedDate), exceptions)
          : null,
        ...withNorm(tu.preparedDate, TU_DEADLINE_DAYS),
      });
    }),
  ]
    .sort(
      (a, b) =>
        a.dto.date.localeCompare(b.dto.date) ||
        TYPE_ORDER[a.dto.type] - TYPE_ORDER[b.dto.type] ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map(({ dto }) => dto);

  const firstResponse = inForce[0];
  return {
    stage: stageOf(inForce, validTu),
    deadlines: {
      tracked: deadlinesTracked(app.regDate),
      // Technical conditions without any response: no response was due.
      response:
        validTu && !firstResponse
          ? null
          : deadline(
              {
                regDate,
                doneOn: firstResponse ? toIsoDate(firstResponse.responseDate) : null,
                norm: RESPONSE_DEADLINE_DAYS,
                today,
              },
              exceptions,
            ),
      tu: deadline(
        {
          regDate,
          doneOn: validTu ? toIsoDate(validTu.preparedDate) : null,
          norm: TU_DEADLINE_DAYS,
          today,
        },
        exceptions,
      ),
    },
    events,
  };
}
