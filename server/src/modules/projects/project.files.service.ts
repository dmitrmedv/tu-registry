import type { ProjectFileKind } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import type { Actor } from '../applications/application.access';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import {
  attachDocumentScan,
  auditDocument,
  documentScanFile,
  loadChangeable,
  loadDocument,
  removeDocumentScan,
  versionConflict,
} from '../documents/document.service';
import {
  deleteStoredFile,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import { Project } from './project.model';
import { PROJECT, projectDto } from './project.service';

type UploadedFile = { path: string; originalname: string; size: number };

async function loadEditable(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, current: await loadChangeable(PROJECT, app, id) };
}

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertEditable(applicationId: string, id: string, actor: Actor) {
  await loadEditable(applicationId, id, actor);
}

// The project's scan: replaced ones are kept, like the scans of technical conditions.

export async function attachScan(
  applicationId: string,
  id: string,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const app = await attachDocumentScan(
    PROJECT,
    () => loadEditable(applicationId, id, actor),
    file,
    actor,
    context,
  );
  return projectDto(app, id);
}

export async function removeScan(
  applicationId: string,
  id: string,
  actor: Actor,
  context: RequestContext,
) {
  const app = await removeDocumentScan(
    PROJECT,
    () => loadEditable(applicationId, id, actor),
    actor,
    context,
  );
  return projectDto(app, id);
}

export async function scanFile(
  applicationId: string,
  id: string,
  fileId: string | undefined,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  return documentScanFile(await loadDocument(PROJECT, app, id), fileId);
}

// The estimate's files: one of each, a replaced one is deleted (like a contract's files).

const FILES = {
  estimateScan: {
    type: 'pdf',
    looksRight: looksLikePdf,
    wrong: () => new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом'),
  },
  // IMD has no known signature: only an empty file is refused.
  estimateImd: {
    type: 'imd',
    looksRight: async () => true,
    wrong: () => new ApiError(400, 'NOT_IMD', 'Файл перевірки кошторису порожній'),
  },
} as const;

export async function attachFile(
  applicationId: string,
  id: string,
  kind: ProjectFileKind,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const rule = FILES[kind];
  try {
    const { app, current } = await loadEditable(applicationId, id, actor);
    if (file.size === 0 || !(await rule.looksRight(file.path))) throw rule.wrong();
    const previous = current[kind];
    const fileId = await storeScan(file.path, rule.type);
    const stored = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The file seen is the one replaced: a concurrent upload makes this one a conflict.
    const { matchedCount } = await Project.updateOne(
      {
        _id: current._id,
        [`${kind}.fileId`]: previous ? previous.fileId : mongoose.trusted({ $exists: false }),
      },
      { $set: { [kind]: stored, updatedBy: actor.id } },
    );
    if (matchedCount === 0) {
      await deleteStoredFile(fileId, rule.type);
      throw versionConflict(PROJECT);
    }
    // Not the file name: it may well name the customer.
    await auditDocument(PROJECT, 'PROJECT_UPDATED', actor, app, current, context, {
      changes: [{ field: kind, from: previous ? 'файл' : null, to: 'новий файл' }],
    });
    if (previous) await deleteStoredFile(previous.fileId, rule.type);
    return projectDto(app, id);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removeEstimateFile(
  applicationId: string,
  id: string,
  kind: ProjectFileKind,
  actor: Actor,
  context: RequestContext,
) {
  const { app, current } = await loadEditable(applicationId, id, actor);
  const stored = current[kind];
  if (!stored) throw ApiError.notFound('Файл не знайдено');
  const { matchedCount } = await Project.updateOne(
    { _id: current._id, [`${kind}.fileId`]: stored.fileId },
    { $unset: { [kind]: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw versionConflict(PROJECT);
  await auditDocument(PROJECT, 'PROJECT_UPDATED', actor, app, current, context, {
    changes: [{ field: kind, from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file still in place.
  await deleteStoredFile(stored.fileId, FILES[kind].type);
  return projectDto(app, id);
}

/** A file of a visible application's project, a cancelled one included. */
export async function estimateFile(
  applicationId: string,
  id: string,
  kind: ProjectFileKind,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const stored = (await loadDocument(PROJECT, app, id))[kind];
  if (!stored) throw ApiError.notFound('Файл не знайдено');
  const { type } = FILES[kind];
  return { path: scanPath(stored.fileId, type), name: stored.name, type };
}
