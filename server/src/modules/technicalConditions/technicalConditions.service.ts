import type {
  CancelDocumentInput,
  ConnectionPoint,
  ConnectionType,
  CreateTechnicalConditionsData,
  GasPressure,
  TechnicalConditionsDto,
  UpdateTechnicalConditionsData,
} from '@tu-registry/shared';
import { fullAddress } from '@tu-registry/shared';
import { ApiError } from '../../utils/ApiError';
import { isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import { loadExceptions } from '../calendar/calendar.service';
import { countWorkingDays } from '../calendar/workingDays';
import { type DocumentRecord, documentDtoParts, documentFileIds } from '../documents/document.dto';
import { assertDocumentDate, resolveEngineer } from '../documents/document.rules';
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
import { deleteScanFile, deleteStoredFile } from '../scans/scan.storage';
import { paymentDtos, paymentFiles } from '../tuPayments/tuPayment.dto';
import { TuPayment } from '../tuPayments/tuPayment.model';
import { TechnicalConditions } from './technicalConditions.model';

export type TechnicalConditionsRecord = DocumentRecord & {
  tuNumber: string;
  preparedDate: Date;
  gasFlow: number;
  connectionType: ConnectionType;
  gasPressure: GasPressure;
  connectionPoint: ConnectionPoint;
  customer: string;
  address: string;
};

const ALREADY_VALID =
  'У заяви вже є чинні технічні умови. Нові можна внести лише після скасування попередніх.';

export const TECHNICAL_CONDITIONS: DocumentKind<TechnicalConditionsRecord> = {
  model: TechnicalConditions,
  entityType: 'TechnicalConditions',
  actions: { updated: 'TU_UPDATED', cancelled: 'TU_CANCELLED', restored: 'TU_RESTORED' },
  auditDetails: (tu) => ({ tuNumber: tu.tuNumber }),
  history: { kind: 'TECHNICAL_CONDITIONS', number: (tu) => tu.tuNumber },
  messages: {
    notFound: 'Технічні умови не знайдено',
    conflict:
      'Технічні умови щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
    cancelled: 'Технічні умови скасовано: їх не можна змінювати',
    notCancelled: 'Технічні умови не скасовано',
    restoreTaken: 'У заяви вже є інші чинні технічні умови: спершу скасуйте їх.',
  },
  onCancel: { active: false },
  onRestore: { active: true },
};

const alreadyValid = () => new ApiError(409, 'DOCUMENT_TAKEN', ALREADY_VALID);

/** Technical conditions with their working days from the registration (current calendar). */
async function toDtos(
  app: ApplicationDocument,
  rows: TechnicalConditionsRecord[],
): Promise<TechnicalConditionsDto[]> {
  const regDate = toIsoDate(app.regDate);
  const [exceptions, common, payments] = await Promise.all([
    loadExceptions(regDate),
    documentDtoParts(rows),
    paymentDtos(rows.map((row) => row._id)),
  ]);
  return rows.map((row) => ({
    ...common(row),
    tuNumber: row.tuNumber,
    preparedDate: toIsoDate(row.preparedDate),
    gasFlow: row.gasFlow,
    connectionType: row.connectionType,
    gasPressure: row.gasPressure,
    connectionPoint: row.connectionPoint,
    customer: row.customer,
    address: row.address,
    workingDays: countWorkingDays(regDate, toIsoDate(row.preparedDate), exceptions),
    payment: payments.get(String(row._id)) ?? null,
  }));
}

export async function technicalConditionsDto(app: ApplicationDocument, id: string) {
  return (await toDtos(app, [await loadDocument(TECHNICAL_CONDITIONS, app, id)]))[0]!;
}

/** Every set of a visible application, cancelled ones too, in the order prepared. */
export async function listTechnicalConditions(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await TechnicalConditions.find({ applicationId: app._id })
    .sort({ preparedDate: 1, createdAt: 1 })
    .lean<TechnicalConditionsRecord[]>();
  return toDtos(app, rows);
}

export async function createTechnicalConditions(
  applicationId: string,
  input: CreateTechnicalConditionsData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  if (await TechnicalConditions.exists({ applicationId: app._id, active: true })) {
    throw alreadyValid();
  }
  assertDocumentDate(app, 'preparedDate', input.preparedDate, 'Дата підготовки ТУ');
  const engineer = await resolveEngineer(app, input.engineer);
  let created;
  try {
    [created] = await changeDocuments(app, (session) =>
      TechnicalConditions.create(
        [
          {
            ...input,
            customer: input.customer ?? app.customer,
            address: input.address ?? fullAddress(app.settlement ?? null, app.objectAddress),
            applicationId: app._id,
            preparedDate: fromIsoDate(input.preparedDate),
            engineer: engineer._id,
            engineerName: engineer.fullName,
            createdBy: actor.id,
          },
        ],
        { session },
      ),
    );
  } catch (error) {
    // Two users adding at once: the index lets one through.
    if (isDuplicateKey(error)) throw alreadyValid();
    throw error;
  }
  const record = created!.toObject() as unknown as TechnicalConditionsRecord;
  await auditDocument(TECHNICAL_CONDITIONS, 'TU_CREATED', actor, app, record, context, {
    preparedDate: input.preparedDate,
  });
  return technicalConditionsDto(app, String(created!._id));
}

const PLAIN_FIELDS = [
  'tuNumber',
  'gasFlow',
  'connectionType',
  'gasPressure',
  'connectionPoint',
] as const;

export async function updateTechnicalConditions(
  applicationId: string,
  id: string,
  input: UpdateTechnicalConditionsData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadChangeable(TECHNICAL_CONDITIONS, app, id, input.version);
  const changes: { field: string; from?: unknown; to?: unknown }[] = [];
  const $set: Record<string, unknown> = { updatedBy: actor.id };

  // Customer data: `auditDocument` keeps its values for the history, out of the audit.
  for (const field of ['customer', 'address', ...PLAIN_FIELDS] as const) {
    const value = input[field];
    if (value !== undefined && value !== current[field]) {
      changes.push({ field, from: current[field], to: value });
      $set[field] = value;
    }
  }
  const preparedDate = toIsoDate(current.preparedDate);
  if (input.preparedDate && input.preparedDate !== preparedDate) {
    assertDocumentDate(app, 'preparedDate', input.preparedDate, 'Дата підготовки ТУ');
    changes.push({ field: 'preparedDate', from: preparedDate, to: input.preparedDate });
    $set.preparedDate = fromIsoDate(input.preparedDate);
  }
  if (input.engineer && input.engineer !== String(current.engineer)) {
    const engineer = await resolveEngineer(app, input.engineer, String(current.engineer));
    changes.push({ field: 'engineer', from: current.engineerName, to: engineer.fullName });
    $set.engineer = engineer._id;
    $set.engineerName = engineer.fullName;
  }
  if (changes.length === 0) return technicalConditionsDto(app, id);

  await changeDocuments(app, (session) =>
    updateSeen(TECHNICAL_CONDITIONS, current, { $set, $inc: { version: 1 } }, session),
  );
  await auditDocument(
    TECHNICAL_CONDITIONS,
    'TU_UPDATED',
    actor,
    app,
    { ...current, tuNumber: input.tuNumber ?? current.tuNumber },
    context,
    { changes },
  );
  return technicalConditionsDto(app, id);
}

export async function cancelTechnicalConditions(
  applicationId: string,
  id: string,
  input: CancelDocumentInput,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await cancelDocument(TECHNICAL_CONDITIONS, app, id, input, actor, context);
  return technicalConditionsDto(app, id);
}

export async function restoreTechnicalConditions(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  await restoreDocument(TECHNICAL_CONDITIONS, app, id, version, actor, context);
  return technicalConditionsDto(app, id);
}

/**
 * For good, by an admin only (agreed 2026-11-19), like a response: the conditions, their
 * payment and every scan of both. The payment goes with them — it cannot stand without them;
 * its invoice number stays in the audit entry.
 */
export async function deleteTechnicalConditions(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const current = await loadDocument(TECHNICAL_CONDITIONS, app, id);
  if (version !== current.version) throw versionConflict(TECHNICAL_CONDITIONS);
  const payment = await TuPayment.findOne({ technicalConditionsId: current._id }).lean();
  await changeDocuments(app, async (session) => {
    const { deletedCount } = await TechnicalConditions.deleteOne(
      { _id: current._id, version },
      { session },
    );
    if (deletedCount === 0) throw versionConflict(TECHNICAL_CONDITIONS);
    if (payment) await TuPayment.deleteOne({ _id: payment._id }, { session });
    await auditDocument(
      TECHNICAL_CONDITIONS,
      'TU_DELETED',
      actor,
      app,
      current,
      context,
      payment ? { paymentInvoiceNumber: payment.invoiceNumber } : {},
      session,
    );
  });
  // After the commit: a failed deletion must not lose the files of conditions still in place.
  await Promise.all([
    ...documentFileIds([current]).map(deleteScanFile),
    ...paymentFiles(payment ? [payment] : []).map(({ fileId, type }) =>
      deleteStoredFile(fileId, type),
    ),
  ]);
}
