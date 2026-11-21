import type { ContractFileKind } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import type { Actor } from '../applications/application.access';
import { loadApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import {
  deleteStoredFile,
  looksLikeDocx,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import {
  auditContract,
  contractConflict,
  contractDto,
  loadChangeableContract,
  loadContract,
} from './contract.service';
import { Contract } from './contract.model';

type UploadedFile = { path: string; originalname: string; size: number };

/** How each file of a contract is stored and checked. */
const FILES = {
  document: {
    type: 'docx',
    looksRight: looksLikeDocx,
    wrong: () => new ApiError(400, 'NOT_DOCX', 'Файл не є документом Word (.docx)'),
  },
  scan: {
    type: 'pdf',
    looksRight: looksLikePdf,
    wrong: () => new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом'),
  },
} as const;

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertFileEditable(applicationId: string, id: string, actor: Actor) {
  await loadChangeableContract(applicationId, id, actor);
}

/**
 * Adds or replaces the Word document or the signed scan. A replaced file is deleted: the
 * contract keeps one of each, and the audit records the change. Files do not bump the version.
 */
export async function attachContractFile(
  applicationId: string,
  id: string,
  kind: ContractFileKind,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  const rule = FILES[kind];
  try {
    const { app, contract } = await loadChangeableContract(applicationId, id, actor);
    if (!(await rule.looksRight(file.path))) throw rule.wrong();
    const previous = contract[kind];
    const fileId = await storeScan(file.path, rule.type);
    const stored = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The file seen is the one replaced: a concurrent upload makes this one a conflict.
    const { matchedCount } = await Contract.updateOne(
      {
        _id: contract._id,
        [`${kind}.fileId`]: previous ? previous.fileId : mongoose.trusted({ $exists: false }),
      },
      { $set: { [kind]: stored, updatedBy: actor.id } },
    );
    if (matchedCount === 0) {
      await deleteStoredFile(fileId, rule.type);
      throw contractConflict();
    }
    // Not the file name: it may well name the customer.
    await auditContract('CONTRACT_UPDATED', actor, app, contract, context, {
      changes: [{ field: kind, from: previous ? 'файл' : null, to: 'новий файл' }],
    });
    if (previous) await deleteStoredFile(previous.fileId, rule.type);
    return contractDto(app, id);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removeContractFile(
  applicationId: string,
  id: string,
  kind: ContractFileKind,
  actor: Actor,
  context: RequestContext,
) {
  const { app, contract } = await loadChangeableContract(applicationId, id, actor);
  const current = contract[kind];
  if (!current) throw ApiError.notFound('Файл не знайдено');
  const { matchedCount } = await Contract.updateOne(
    { _id: contract._id, [`${kind}.fileId`]: current.fileId },
    { $unset: { [kind]: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw contractConflict();
  await auditContract('CONTRACT_UPDATED', actor, app, contract, context, {
    changes: [{ field: kind, from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file still in place.
  await deleteStoredFile(current.fileId, FILES[kind].type);
  return contractDto(app, id);
}

/** A file of a visible application's contract, a cancelled one included. */
export async function contractFile(
  applicationId: string,
  id: string,
  kind: ContractFileKind,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const stored = (await loadContract(app, id))[kind];
  if (!stored) throw ApiError.notFound('Файл не знайдено');
  const { type } = FILES[kind];
  return { path: scanPath(stored.fileId, type), name: stored.name, type };
}
