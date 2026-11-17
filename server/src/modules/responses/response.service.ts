import type {
  CancelDocumentInput,
  CreateResponseInput,
  ResponseDto,
  UpdateResponseInput,
} from '@tu-registry/shared';
import { fromIsoDate, kyivToday, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import { loadExceptions } from '../calendar/calendar.service';
import { countWorkingDays } from '../calendar/workingDays';
import { type DocumentRecord, documentDtoParts, documentFileIds } from '../documents/document.dto';
import { assertDocumentDate, fieldError, resolveEngineer } from '../documents/document.rules';
import {
  auditDocument,
  cancelDocument,
  type DocumentKind,
  loadChangeable,
  loadDocument,
  changeDocuments,
  restoreDocument,
  updateSeen,
  versionConflict,
} from '../documents/document.service';
import { deleteScanFile } from '../scans/scan.storage';
import { ApplicationResponse } from './response.model';

export type ResponseRecord = DocumentRecord & {
  outgoingNumber: string;
  responseDate: Date;
  documentsReceivedAt?: Date | null;
};

export const RESPONSE: DocumentKind<ResponseRecord> = {
  model: ApplicationResponse,
  entityType: 'ApplicationResponse',
  actions: {
    updated: 'RESPONSE_UPDATED',
    cancelled: 'RESPONSE_CANCELLED',
    restored: 'RESPONSE_RESTORED',
  },
  auditDetails: (response) => ({ outgoingNumber: response.outgoingNumber }),
  messages: {
    notFound: 'Відповідь не знайдено',
    conflict:
      'Відповідь щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
    cancelled: 'Відповідь скасовано: її не можна змінювати',
    notCancelled: 'Відповідь не скасовано',
  },
};

/** Responses with their working days from the registration, by the current calendar. */
async function toDtos(app: ApplicationDocument, rows: ResponseRecord[]): Promise<ResponseDto[]> {
  const regDate = toIsoDate(app.regDate);
  const [exceptions, common] = await Promise.all([loadExceptions(regDate), documentDtoParts(rows)]);
  return rows.map((row) => ({
    ...common(row),
    outgoingNumber: row.outgoingNumber,
    responseDate: toIsoDate(row.responseDate),
    documentsReceivedAt: row.documentsReceivedAt ? toIsoDate(row.documentsReceivedAt) : null,
    workingDays: countWorkingDays(regDate, toIsoDate(row.responseDate), exceptions),
  }));
}

export async function responseDto(app: ApplicationDocument, responseId: string) {
  return (await toDtos(app, [await loadDocument(RESPONSE, app, responseId)]))[0]!;
}

/** Every response of a visible application, cancelled ones too, in the order given. */
export async function listResponses(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await ApplicationResponse.find({ applicationId: app._id })
    .sort({ responseDate: 1, createdAt: 1 })
    .lean<ResponseRecord[]>();
  return toDtos(app, rows);
}

export async function createResponse(
  applicationId: string,
  input: CreateResponseInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const {
    outgoingNumber,
    responseDate,
    engineer: engineerId,
  } = input as Required<Pick<CreateResponseInput, 'outgoingNumber' | 'responseDate' | 'engineer'>>;
  assertDocumentDate(app, 'responseDate', responseDate, 'Дата відповіді');
  const engineer = await resolveEngineer(app, engineerId);
  const [created] = await changeDocuments(app, (session) =>
    ApplicationResponse.create(
      [
        {
          applicationId: app._id,
          outgoingNumber,
          responseDate: fromIsoDate(responseDate),
          engineer: engineer._id,
          engineerName: engineer.fullName,
          createdBy: actor.id,
        },
      ],
      { session },
    ),
  );
  const record = created!.toObject() as unknown as ResponseRecord;
  await auditDocument(RESPONSE, 'RESPONSE_CREATED', actor, app, record, context, {
    responseDate,
  });
  return responseDto(app, String(created!._id));
}

export async function updateResponse(
  applicationId: string,
  responseId: string,
  input: UpdateResponseInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadChangeable(RESPONSE, app, responseId, input.version);
  const was = {
    outgoingNumber: current.outgoingNumber,
    responseDate: toIsoDate(current.responseDate),
    engineer: current.engineerName,
    documentsReceivedAt: current.documentsReceivedAt
      ? toIsoDate(current.documentsReceivedAt)
      : null,
  };
  const next = {
    outgoingNumber: input.outgoingNumber ?? was.outgoingNumber,
    responseDate: input.responseDate ?? was.responseDate,
    engineer: was.engineer,
    documentsReceivedAt:
      input.documentsReceivedAt === undefined ? was.documentsReceivedAt : input.documentsReceivedAt,
  };

  if (next.responseDate !== was.responseDate) {
    assertDocumentDate(app, 'responseDate', next.responseDate, 'Дата відповіді');
  }
  if (next.documentsReceivedAt && next.documentsReceivedAt !== was.documentsReceivedAt) {
    if (next.documentsReceivedAt > kyivToday().iso) {
      throw fieldError('documentsReceivedAt', 'Дата надходження не може бути в майбутньому');
    }
  }
  if (next.documentsReceivedAt && next.documentsReceivedAt < next.responseDate) {
    throw fieldError(
      input.documentsReceivedAt ? 'documentsReceivedAt' : 'responseDate',
      'Документи не можуть надійти раніше дати відповіді',
    );
  }

  const $set: Record<string, unknown> = { updatedBy: actor.id };
  if (input.engineer && input.engineer !== String(current.engineer)) {
    const engineer = await resolveEngineer(app, input.engineer, String(current.engineer));
    next.engineer = engineer.fullName;
    $set.engineer = engineer._id;
    $set.engineerName = engineer.fullName;
  }
  const changes = (Object.keys(was) as (keyof typeof was)[])
    .filter((field) => was[field] !== next[field] || (field === 'engineer' && $set.engineer))
    .map((field) => ({ field, from: was[field], to: next[field] }));
  if (changes.length === 0) return responseDto(app, responseId);

  $set.outgoingNumber = next.outgoingNumber;
  $set.responseDate = fromIsoDate(next.responseDate);
  const update: Record<string, unknown> = { $set, $inc: { version: 1 } };
  if (next.documentsReceivedAt) $set.documentsReceivedAt = fromIsoDate(next.documentsReceivedAt);
  else update.$unset = { documentsReceivedAt: 1 };

  await changeDocuments(app, (session) => updateSeen(RESPONSE, current, update, session));
  await auditDocument(
    RESPONSE,
    'RESPONSE_UPDATED',
    actor,
    app,
    { ...current, outgoingNumber: next.outgoingNumber },
    context,
    { changes },
  );
  return responseDto(app, responseId);
}

export async function cancelResponse(
  applicationId: string,
  responseId: string,
  input: CancelDocumentInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await cancelDocument(RESPONSE, app, responseId, input, actor, context);
  return responseDto(app, responseId);
}

export async function restoreResponse(
  applicationId: string,
  responseId: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await restoreDocument(RESPONSE, app, responseId, version, actor, context);
  return responseDto(app, responseId);
}

/**
 * Admin only (enforced by the route): removes a response entered by mistake, valid or
 * cancelled, with every scan it had. The application's stage and timeline are recomputed in
 * the same transaction; the audit entry keeps the outgoing number only.
 */
export async function deleteResponse(
  applicationId: string,
  responseId: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadDocument(RESPONSE, app, responseId);
  if (version !== current.version) throw versionConflict(RESPONSE);
  await changeDocuments(app, async (session) => {
    const { deletedCount } = await ApplicationResponse.deleteOne(
      { _id: current._id, version },
      { session },
    );
    if (deletedCount === 0) throw versionConflict(RESPONSE);
    await auditDocument(RESPONSE, 'RESPONSE_DELETED', actor, app, current, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of a still existing response.
  await Promise.all(documentFileIds([current]).map(deleteScanFile));
}
