import {
  type AuditAction,
  type CreateEstimateData,
  type EstimateDto,
  formatHryvnias,
  fromKopecks,
  toKopecks,
  type UpdateEstimateData,
} from '@tu-registry/shared';
import type { ClientSession, Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import { type FieldChange, recordDocumentChange } from '../applications/applicationChange.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import type { ScanRecord } from '../documents/document.dto';
import { assertDocumentDate, regNumberOf } from '../documents/document.rules';
import { Project } from '../projects/project.model';
import { deleteStoredFile } from '../scans/scan.storage';
import { findUserSummaries } from '../users/user.service';
import { Estimate } from './estimate.model';

export type EstimateRecord = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  projectId: Types.ObjectId;
  checkDate: Date | null;
  amountKopecks: number | null;
  subcontractAmountKopecks?: number | null;
  scan?: ScanRecord | null;
  imd?: ScanRecord | null;
  superseded?: { at: Date; by: Types.ObjectId } | null;
  active: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

type ProjectRef = { _id: Types.ObjectId; approvalNumber: string; active: boolean };

export const estimateConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Кошторис щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );
const estimateNotFound = () => ApiError.notFound('Кошторис не знайдено');

/** The stored files of `rows`: for deleting them with the estimate, its project or application. */
export const estimateFiles = (rows: Pick<EstimateRecord, 'scan' | 'imd'>[]) =>
  rows.flatMap((row) => [
    ...(row.scan ? [{ fileId: row.scan.fileId, type: 'pdf' as const }] : []),
    ...(row.imd ? [{ fileId: row.imd.fileId, type: 'imd' as const }] : []),
  ]);

const amountText = (kopecks: number | null) =>
  kopecks === null ? null : formatHryvnias(fromKopecks(kopecks));

/**
 * Journals a change of an estimate in the application's «Історія змін» (under the project's
 * number: the estimate has none of its own) and in the audit. No customer data here.
 */
export async function auditEstimate(
  action: AuditAction,
  actor: Actor,
  app: ApplicationDocument,
  project: Pick<ProjectRef, 'approvalNumber'>,
  estimate: Pick<EstimateRecord, '_id'>,
  context: RequestContext,
  { changes, ...extra }: { changes?: FieldChange[] } & Record<string, unknown> = {},
  session?: ClientSession,
) {
  await recordDocumentChange(
    {
      applicationId: app._id,
      actorId: actor.id,
      action,
      document: { kind: 'ESTIMATE', id: estimate._id, number: project.approvalNumber },
      changes,
    },
    session,
  );
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'Estimate',
      entityId: estimate._id,
      details: {
        applicationId: String(app._id),
        regNumber: await regNumberOf(app),
        approvalNumber: project.approvalNumber,
        ...extra,
        ...(changes && { changes }),
      },
    },
    context,
    session,
  );
}

async function toDtos(rows: EstimateRecord[]): Promise<EstimateDto[]> {
  const names = await findUserSummaries(
    rows.flatMap((row) => [
      String(row.createdBy),
      row.superseded ? String(row.superseded.by) : null,
      row.scan ? String(row.scan.uploadedBy) : null,
      row.imd ? String(row.imd.uploadedBy) : null,
    ]),
  );
  const person = (id: Types.ObjectId) => ({
    id: String(id),
    fullName: names.get(String(id))?.fullName ?? '—',
  });
  const fileDto = (file?: ScanRecord | null) =>
    file
      ? {
          name: file.name,
          size: file.size,
          uploadedAt: file.uploadedAt.toISOString(),
          uploadedBy: person(file.uploadedBy),
        }
      : null;
  return rows.map((row) => ({
    id: String(row._id),
    applicationId: String(row.applicationId),
    projectId: String(row.projectId),
    checkDate: row.checkDate ? toIsoDate(row.checkDate) : null,
    amount: row.amountKopecks === null ? null : fromKopecks(row.amountKopecks),
    // Absent in the estimates entered before the field.
    subcontractAmount:
      (row.subcontractAmountKopecks ?? null) === null
        ? null
        : fromKopecks(row.subcontractAmountKopecks!),
    scan: fileDto(row.scan),
    imd: fileDto(row.imd),
    superseded: row.superseded
      ? { at: row.superseded.at.toISOString(), by: person(row.superseded.by) }
      : null,
    createdBy: person(row.createdBy),
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  }));
}

/** An estimate of this application (another application's is "not found"). */
export async function loadEstimate(app: ApplicationDocument, id: string) {
  const estimate = await Estimate.findOne({
    _id: id,
    applicationId: app._id,
  }).lean<EstimateRecord>();
  if (!estimate) throw estimateNotFound();
  return estimate;
}

/** The project of an estimate: its number goes to the journal. */
async function projectOf(estimate: Pick<EstimateRecord, 'projectId'>) {
  const project = await Project.findById(estimate.projectId)
    .select('approvalNumber active')
    .lean<ProjectRef>();
  return project ?? { _id: estimate.projectId, approvalNumber: '—', active: false };
}

/**
 * An estimate open to changes: the current one (not superseded) of the valid project of an
 * editable application. A superseded estimate, or one of a cancelled project, is history.
 */
export async function loadChangeableEstimate(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  const estimate = await loadEstimate(app, id);
  if (!estimate.active) {
    throw new ApiError(
      409,
      'ESTIMATE_SUPERSEDED',
      'Кошторис перераховано: змінювати можна лише чинний кошторис',
    );
  }
  const project = await projectOf(estimate);
  if (!project.active) {
    throw new ApiError(
      409,
      'DOCUMENT_CANCELLED',
      'Проєкт скасовано: його кошторис не можна змінювати',
    );
  }
  return { app, estimate, project };
}

export async function estimateDto(app: ApplicationDocument, id: string) {
  return (await toDtos([await loadEstimate(app, id)]))[0]!;
}

/** Every estimate of a visible application, superseded ones too, in the order made. */
export async function listEstimates(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await Estimate.find({ applicationId: app._id })
    .sort({ createdAt: 1, _id: 1 })
    .lean<EstimateRecord[]>();
  return toDtos(rows);
}

const checkDateOf = async (app: ApplicationDocument, checkDate: string | null) => {
  if (checkDate) await assertDocumentDate(app, 'checkDate', checkDate, 'Дата перевірки кошторису');
  return checkDate ? fromIsoDate(checkDate) : null;
};

/**
 * Made under the valid project (agreed 2026-11-21). With a current estimate already there this is
 * its recalculation: the current one becomes «Перераховано» in the same transaction.
 */
export async function createEstimate(
  applicationId: string,
  input: CreateEstimateData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const project = await Project.findOne({ applicationId: app._id, active: true })
    .select('approvalNumber active')
    .lean<ProjectRef>();
  if (!project) {
    throw new ApiError(
      409,
      'NO_PROJECT',
      'Кошторис вносять за чинним проєктом: спершу внесіть проєкт.',
    );
  }
  const checkDate = await checkDateOf(app, input.checkDate);
  const amountKopecks = input.amount === null ? null : toKopecks(input.amount);
  const subcontractAmountKopecks =
    input.subcontractAmount === null ? null : toKopecks(input.subcontractAmount);
  let result: { created: EstimateRecord; replaced: EstimateRecord | null };
  try {
    result = await inTransaction(async (session) => {
      const replaced = await Estimate.findOne({ projectId: project._id, active: true })
        .session(session)
        .lean<EstimateRecord>();
      if (replaced) {
        const { matchedCount } = await Estimate.updateOne(
          { _id: replaced._id, version: replaced.version },
          {
            $set: {
              active: false,
              superseded: { at: clock.now(), by: actor.id },
              updatedBy: actor.id,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (matchedCount === 0) throw estimateConflict();
      }
      const [created] = await Estimate.create(
        [
          {
            applicationId: app._id,
            projectId: project._id,
            checkDate,
            amountKopecks,
            subcontractAmountKopecks,
            createdBy: actor.id,
          },
        ],
        { session },
      );
      return { created: created!.toObject() as unknown as EstimateRecord, replaced };
    });
  } catch (error) {
    // Two users adding at once: the index lets one through.
    if (isDuplicateKey(error)) throw estimateConflict();
    throw error;
  }
  if (result.replaced) {
    await auditEstimate('ESTIMATE_UPDATED', actor, app, project, result.replaced, context, {
      changes: [{ field: 'superseded', from: null, to: 'перераховано' }],
    });
  }
  await auditEstimate('ESTIMATE_CREATED', actor, app, project, result.created, context, {
    ...(input.checkDate && { checkDate: input.checkDate }),
    ...(amountKopecks !== null && { amount: amountText(amountKopecks) }),
    ...(subcontractAmountKopecks !== null && {
      subcontractAmount: amountText(subcontractAmountKopecks),
    }),
    ...(result.replaced && { recalculated: true }),
  });
  return estimateDto(app, String(result.created._id));
}

/** Saves the form of the estimate the user saw (`version`). */
export async function updateEstimate(
  applicationId: string,
  id: string,
  input: UpdateEstimateData,
  actor: Actor,
  context: RequestContext,
) {
  const { app, estimate, project } = await loadChangeableEstimate(applicationId, id, actor);
  if (input.version !== estimate.version) throw estimateConflict();
  const changes: FieldChange[] = [];
  const $set: Record<string, unknown> = { updatedBy: actor.id };
  const checkDate = estimate.checkDate ? toIsoDate(estimate.checkDate) : null;
  if (input.checkDate !== checkDate) {
    $set.checkDate = await checkDateOf(app, input.checkDate);
    changes.push({ field: 'checkDate', from: checkDate, to: input.checkDate });
  }
  const amountKopecks = input.amount === null ? null : toKopecks(input.amount);
  if (amountKopecks !== estimate.amountKopecks) {
    $set.amountKopecks = amountKopecks;
    changes.push({
      field: 'amount',
      from: amountText(estimate.amountKopecks),
      to: amountText(amountKopecks),
    });
  }
  const subcontractAmountKopecks =
    input.subcontractAmount === null ? null : toKopecks(input.subcontractAmount);
  const subcontractBefore = estimate.subcontractAmountKopecks ?? null;
  if (subcontractAmountKopecks !== subcontractBefore) {
    $set.subcontractAmountKopecks = subcontractAmountKopecks;
    changes.push({
      field: 'subcontractAmount',
      from: amountText(subcontractBefore),
      to: amountText(subcontractAmountKopecks),
    });
  }
  if (changes.length === 0) return estimateDto(app, id);

  const { matchedCount } = await Estimate.updateOne(
    { _id: estimate._id, version: estimate.version, active: true },
    { $set, $inc: { version: 1 } },
  );
  if (matchedCount === 0) throw estimateConflict();
  await auditEstimate('ESTIMATE_UPDATED', actor, app, project, estimate, context, { changes });
  return estimateDto(app, id);
}

/**
 * Admin only (enforced by the route): the estimate and its files, for good. Deleting the current
 * estimate (a recalculation made by mistake) makes the one it replaced current again.
 */
export async function deleteEstimate(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const estimate = await loadEstimate(app, id);
  if (version !== estimate.version) throw estimateConflict();
  const project = await projectOf(estimate);
  await inTransaction(async (session) => {
    const { deletedCount } = await Estimate.deleteOne({ _id: estimate._id, version }, { session });
    if (deletedCount === 0) throw estimateConflict();
    if (estimate.active) {
      const previous = await Estimate.findOne({ projectId: estimate.projectId })
        .sort({ createdAt: -1, _id: -1 })
        .session(session)
        .lean<EstimateRecord>();
      if (previous) {
        await Estimate.updateOne(
          { _id: previous._id },
          {
            $set: { active: true, updatedBy: actor.id },
            $unset: { superseded: 1 },
            $inc: { version: 1 },
          },
          { session },
        );
      }
    }
    await auditEstimate('ESTIMATE_DELETED', actor, app, project, estimate, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of an estimate still in place.
  await Promise.all(
    estimateFiles([estimate]).map(({ fileId, type }) => deleteStoredFile(fileId, type)),
  );
}
