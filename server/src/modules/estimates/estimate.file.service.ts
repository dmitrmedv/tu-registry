import type { EstimateFileKind } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import type { Actor } from '../applications/application.access';
import { loadApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import {
  deleteStoredFile,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import { Estimate } from './estimate.model';
import {
  auditEstimate,
  estimateConflict,
  estimateDto,
  loadChangeableEstimate,
  loadEstimate,
} from './estimate.service';

type UploadedFile = { path: string; originalname: string; size: number };

// One of each: a replaced file is deleted (like the invoice's files).
const FILES = {
  scan: {
    type: 'pdf',
    looksRight: looksLikePdf,
    wrong: () => new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом'),
  },
  // IMD has no known signature: only an empty file is refused.
  imd: {
    type: 'imd',
    looksRight: async () => true,
    wrong: () => new ApiError(400, 'NOT_IMD', 'Файл перевірки кошторису порожній'),
  },
} as const;

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertFileEditable(applicationId: string, id: string, actor: Actor) {
  await loadChangeableEstimate(applicationId, id, actor);
}

/** Adds or replaces the estimate's scan or IMD file. Files do not bump the version. */
export async function attachEstimateFile(
  applicationId: string,
  id: string,
  kind: EstimateFileKind,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const rule = FILES[kind];
  try {
    const { app, estimate, project } = await loadChangeableEstimate(applicationId, id, actor);
    if (file.size === 0 || !(await rule.looksRight(file.path))) throw rule.wrong();
    const previous = estimate[kind];
    const fileId = await storeScan(file.path, rule.type);
    const stored = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The file seen is the one replaced: a concurrent upload makes this one a conflict.
    const { matchedCount } = await Estimate.updateOne(
      {
        _id: estimate._id,
        active: true,
        [`${kind}.fileId`]: previous ? previous.fileId : mongoose.trusted({ $exists: false }),
      },
      { $set: { [kind]: stored, updatedBy: actor.id } },
    );
    if (matchedCount === 0) {
      await deleteStoredFile(fileId, rule.type);
      throw estimateConflict();
    }
    // Not the file name: it may well name the customer.
    await auditEstimate('ESTIMATE_UPDATED', actor, app, project, estimate, context, {
      changes: [{ field: kind, from: previous ? 'файл' : null, to: 'новий файл' }],
    });
    if (previous) await deleteStoredFile(previous.fileId, rule.type);
    return estimateDto(app, id);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removeEstimateFile(
  applicationId: string,
  id: string,
  kind: EstimateFileKind,
  actor: Actor,
  context: RequestContext,
) {
  const { app, estimate, project } = await loadChangeableEstimate(applicationId, id, actor);
  const current = estimate[kind];
  if (!current) throw ApiError.notFound('Файл не знайдено');
  const { matchedCount } = await Estimate.updateOne(
    { _id: estimate._id, active: true, [`${kind}.fileId`]: current.fileId },
    { $unset: { [kind]: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw estimateConflict();
  await auditEstimate('ESTIMATE_UPDATED', actor, app, project, estimate, context, {
    changes: [{ field: kind, from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file still in place.
  await deleteStoredFile(current.fileId, FILES[kind].type);
  return estimateDto(app, id);
}

/** A file of a visible application's estimate, a superseded one included. */
export async function estimateFile(
  applicationId: string,
  id: string,
  kind: EstimateFileKind,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const stored = (await loadEstimate(app, id))[kind];
  if (!stored) throw ApiError.notFound('Файл не знайдено');
  const { type } = FILES[kind];
  return { path: scanPath(stored.fileId, type), name: stored.name, type };
}
