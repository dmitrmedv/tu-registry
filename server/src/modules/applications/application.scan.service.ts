import { SCAN_NAME_MAX } from '@tu-registry/shared';
import path from 'node:path';
import type { Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { inTransaction } from '../../utils/db';
import {
  deleteScanFile,
  looksLikePdf,
  removeFile,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import type { Actor } from './application.access';
import { getApplication, loadApplication } from './application.edit.service';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

type UploadedFile = { path: string; originalname: string; size: number };

/**
 * The scan follows the rules of editing (anyone in the application's department, or an
 * admin; not while annulled). Checked before the file is read, and again when it is stored.
 * Scans do not bump the application's version: they never conflict with an edit of its fields.
 */
export async function assertScanEditable(id: string, actor: Actor) {
  const app = await loadApplication(id, actor);
  if (app.status === 'ANNULLED') {
    throw new ApiError(
      409,
      'APPLICATION_ANNULLED',
      'Анульовану заяву не можна змінювати. Спершу її має відновити адміністратор.',
    );
  }
  return app;
}

/** The user's file name, made safe to show: no path, no control characters, bounded. */
function displayName(originalName: string) {
  const base = path.posix.basename(originalName.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'скан.pdf').slice(0, SCAN_NAME_MAX);
}

async function recordScanChange(
  applicationId: Types.ObjectId,
  actorId: string,
  update: Record<string, unknown>,
  change: { oldValue: string | null; newValue: string | null },
) {
  await inTransaction(async (session) => {
    const { matchedCount } = await Application.updateOne(
      { _id: applicationId, status: 'ACTIVE' },
      update,
      { session },
    );
    if (matchedCount === 0) throw new ApiError(409, 'APPLICATION_ANNULLED', 'Заяву анульовано');
    await ApplicationChange.create(
      [
        {
          applicationId,
          changedBy: actorId,
          action: 'UPDATED',
          changes: [{ field: 'scan', ...change }],
        },
      ],
      { session },
    );
  });
}

/** Adds or replaces the scan. The previous file is removed only once the new one is recorded. */
export async function attachScan(id: string, file: UploadedFile, actor: Actor) {
  try {
    const current = await assertScanEditable(id, actor);
    if (!(await looksLikePdf(file.path))) {
      throw new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом');
    }
    const name = displayName(file.originalname);
    const fileId = await storeScan(file.path);
    try {
      await recordScanChange(
        current._id,
        actor.id,
        {
          $set: {
            scan: { fileId, name, size: file.size, uploadedAt: clock.now(), uploadedBy: actor.id },
            updatedBy: actor.id,
          },
        },
        { oldValue: current.scan?.name ?? null, newValue: name },
      );
    } catch (error) {
      await deleteScanFile(fileId);
      throw error;
    }
    if (current.scan) await deleteScanFile(current.scan.fileId);
    return getApplication(id, actor);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removeScan(id: string, actor: Actor) {
  const current = await assertScanEditable(id, actor);
  if (!current.scan) throw ApiError.notFound('У заяви немає скану');
  await recordScanChange(
    current._id,
    actor.id,
    { $unset: { scan: 1 }, $set: { updatedBy: actor.id } },
    { oldValue: current.scan.name, newValue: null },
  );
  await deleteScanFile(current.scan.fileId);
  return getApplication(id, actor);
}

/** Where the scan of a visible application is, and how to name it for the browser. */
export async function scanFile(id: string, actor: Actor) {
  const app = await loadApplication(id, actor);
  if (!app.scan) throw ApiError.notFound('У заяви немає скану');
  return { path: scanPath(app.scan.fileId), name: app.scan.name };
}
