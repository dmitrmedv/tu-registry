import {
  type CancelDocumentInput,
  type CreateResponseInput,
  formatRegNumber,
  type ResponseDto,
  type UpdateResponseInput,
} from '@tu-registry/shared';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { fromIsoDate, kyivToday, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { loadExceptions } from '../calendar/calendar.service';
import { countWorkingDays } from '../calendar/workingDays';
import { departmentCode } from '../departments/department.service';
import { Engineer } from '../engineers/engineer.model';
import { findUserSummaries } from '../users/user.service';
import { ApplicationResponse } from './response.model';

type ScanRecord = {
  fileId: string;
  name: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: Types.ObjectId;
};
export type ResponseRecord = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  outgoingNumber: string;
  responseDate: Date;
  engineer: Types.ObjectId;
  engineerName: string;
  documentsReceivedAt?: Date | null;
  scan?: ScanRecord | null;
  previousScans: ScanRecord[];
  cancellation?: { reason: string; at: Date; by: Types.ObjectId } | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

export function fieldError(field: string, message: string) {
  return new ApiError(400, 'VALIDATION_ERROR', message, {
    formErrors: [],
    fieldErrors: { [field]: [message] },
  });
}

const responseNotFound = () => ApiError.notFound('Відповідь не знайдено');
const responseConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Відповідь щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );
const responseCancelled = () =>
  new ApiError(409, 'DOCUMENT_CANCELLED', 'Відповідь скасовано: її не можна змінювати');

export async function regNumberOf(app: ApplicationDocument) {
  return formatRegNumber(app.regYear, app.regSeq, await departmentCode(app.department));
}

/** Documents are dated between the registration and today (Kyiv). */
export function assertDocumentDate(
  app: ApplicationDocument,
  field: string,
  isoDate: string,
  label: string,
) {
  const regDate = toIsoDate(app.regDate);
  if (isoDate < regDate) {
    throw fieldError(
      field,
      `${label} не може бути раніше дати реєстрації заяви (${regDate.split('-').reverse().join('.')})`,
    );
  }
  if (isoDate > kyivToday().iso) throw fieldError(field, `${label} не може бути в майбутньому`);
}

/**
 * An active engineer of the application's department. `keep`: the engineer already chosen,
 * who stays valid after deactivation (editing other fields must not force a change).
 */
export async function resolveEngineer(app: ApplicationDocument, id: string, keep?: string) {
  const engineer = await Engineer.findById(id).lean();
  if (!engineer || engineer.department !== app.department) {
    throw fieldError('engineer', 'Оберіть інженера управління заяви');
  }
  if (!engineer.isActive && String(engineer._id) !== keep) {
    throw fieldError('engineer', 'Інженера деактивовано: оберіть іншого');
  }
  return engineer;
}

const audit = (
  action: 'RESPONSE_CREATED' | 'RESPONSE_UPDATED' | 'RESPONSE_CANCELLED' | 'RESPONSE_RESTORED',
  actor: Actor,
  response: Pick<ResponseRecord, '_id' | 'applicationId' | 'outgoingNumber'>,
  regNumber: string,
  context: RequestContext,
  extra: Record<string, unknown> = {},
) =>
  // Our own numbers and dates only: customer data does not belong in the audit log.
  recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'ApplicationResponse',
      entityId: response._id,
      details: {
        applicationId: String(response.applicationId),
        regNumber,
        outgoingNumber: response.outgoingNumber,
        ...extra,
      },
    },
    context,
  );

/** Responses with their working days from the registration, by the current calendar. */
async function toDtos(app: ApplicationDocument, rows: ResponseRecord[]): Promise<ResponseDto[]> {
  const regDate = toIsoDate(app.regDate);
  const scans = (row: ResponseRecord) => [...(row.scan ? [row.scan] : []), ...row.previousScans];
  const [exceptions, names] = await Promise.all([
    loadExceptions(regDate),
    findUserSummaries(
      rows.flatMap((row) => [
        String(row.createdBy),
        row.cancellation ? String(row.cancellation.by) : null,
        ...scans(row).map((scan) => String(scan.uploadedBy)),
      ]),
    ),
  ]);
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    fullName: names.get(String(id))?.fullName ?? '—',
  });
  const scanDto = (scan: ScanRecord) => ({
    name: scan.name,
    size: scan.size,
    uploadedAt: scan.uploadedAt.toISOString(),
    uploadedBy: person(scan.uploadedBy),
  });
  return rows.map((row) => ({
    id: String(row._id),
    applicationId: String(row.applicationId),
    outgoingNumber: row.outgoingNumber,
    responseDate: toIsoDate(row.responseDate),
    engineer: { id: String(row.engineer), fullName: row.engineerName },
    documentsReceivedAt: row.documentsReceivedAt ? toIsoDate(row.documentsReceivedAt) : null,
    workingDays: countWorkingDays(regDate, toIsoDate(row.responseDate), exceptions),
    scan: row.scan ? scanDto(row.scan) : null,
    previousScans: row.previousScans.map((scan) => ({ id: scan.fileId, ...scanDto(scan) })),
    cancellation: row.cancellation
      ? {
          reason: row.cancellation.reason,
          at: row.cancellation.at.toISOString(),
          by: person(row.cancellation.by),
        }
      : null,
    createdBy: person(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  }));
}

export async function loadResponse(app: ApplicationDocument, responseId: string) {
  const response = await ApplicationResponse.findOne({
    _id: responseId,
    applicationId: app._id,
  }).lean<ResponseRecord>();
  if (!response) throw responseNotFound();
  return response;
}

async function responseDto(app: ApplicationDocument, responseId: string) {
  return (await toDtos(app, [await loadResponse(app, responseId)]))[0]!;
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
  const created = await ApplicationResponse.create({
    applicationId: app._id,
    outgoingNumber,
    responseDate: fromIsoDate(responseDate),
    engineer: engineer._id,
    engineerName: engineer.fullName,
    createdBy: actor.id,
  });
  await audit('RESPONSE_CREATED', actor, created, await regNumberOf(app), context, {
    responseDate,
  });
  return responseDto(app, String(created._id));
}

/** A response that may be changed: of an editable application, not cancelled, as seen. */
async function loadChangeable(app: ApplicationDocument, responseId: string, version?: number) {
  const current = await loadResponse(app, responseId);
  if (current.cancellation) throw responseCancelled();
  if (version !== undefined && version !== current.version) throw responseConflict();
  return current;
}

export async function updateResponse(
  applicationId: string,
  responseId: string,
  input: UpdateResponseInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadChangeable(app, responseId, input.version);
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

  const { matchedCount } = await ApplicationResponse.updateOne(
    { _id: current._id, version: current.version },
    update,
  );
  if (matchedCount === 0) throw responseConflict();
  await audit(
    'RESPONSE_UPDATED',
    actor,
    { ...current, outgoingNumber: next.outgoingNumber },
    await regNumberOf(app),
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
  const current = await loadChangeable(app, responseId, input.version);
  const { matchedCount } = await ApplicationResponse.updateOne(
    { _id: current._id, version: current.version },
    {
      $set: {
        cancellation: { reason: input.reason, at: clock.now(), by: actor.id },
        updatedBy: actor.id,
      },
      $inc: { version: 1 },
    },
  );
  if (matchedCount === 0) throw responseConflict();
  // The reason is free text and may name the customer: it stays with the response only.
  await audit('RESPONSE_CANCELLED', actor, current, await regNumberOf(app), context);
  return responseDto(app, responseId);
}

/** Admins only (enforced by the route). */
export async function restoreResponse(
  applicationId: string,
  responseId: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadResponse(app, responseId);
  if (!current.cancellation) throw new ApiError(409, 'NOT_CANCELLED', 'Відповідь не скасовано');
  if (version !== current.version) throw responseConflict();
  const { matchedCount } = await ApplicationResponse.updateOne(
    { _id: current._id, version: current.version },
    { $unset: { cancellation: 1 }, $set: { updatedBy: actor.id }, $inc: { version: 1 } },
  );
  if (matchedCount === 0) throw responseConflict();
  await audit('RESPONSE_RESTORED', actor, current, await regNumberOf(app), context);
  return responseDto(app, responseId);
}

/** For the scan service: the response may get a new scan. */
export async function loadScanEditableResponse(
  applicationId: string,
  responseId: string,
  actor: Actor,
) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, response: await loadChangeable(app, responseId) };
}

export { responseConflict, responseDto };
