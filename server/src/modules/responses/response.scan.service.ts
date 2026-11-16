import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import type { Actor } from '../applications/application.access';
import { loadApplication } from '../applications/application.edit.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import {
  deleteScanFile,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import { ApplicationResponse } from './response.model';
import {
  loadResponse,
  loadScanEditableResponse,
  regNumberOf,
  responseConflict,
  responseDto,
} from './response.service';

type UploadedFile = { path: string; originalname: string; size: number };

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertResponseScanEditable(
  applicationId: string,
  responseId: string,
  actor: Actor,
) {
  await loadScanEditableResponse(applicationId, responseId, actor);
}

/**
 * Adds or replaces the response's scan. A replaced scan is kept among `previousScans`: it was
 * part of the processing. Scans do not bump the version, like the application's own scan.
 */
export async function attachResponseScan(
  applicationId: string,
  responseId: string,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  try {
    const { app, response } = await loadScanEditableResponse(applicationId, responseId, actor);
    if (!(await looksLikePdf(file.path))) {
      throw new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом');
    }
    const fileId = await storeScan(file.path);
    const scan = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The scan seen is the one moved aside: a concurrent upload makes this one a conflict.
    const { matchedCount } = await ApplicationResponse.updateOne(
      {
        _id: response._id,
        cancellation: mongoose.trusted({ $exists: false }),
        'scan.fileId': response.scan ? response.scan.fileId : mongoose.trusted({ $exists: false }),
      },
      {
        $set: { scan, updatedBy: actor.id },
        ...(response.scan && { $push: { previousScans: response.scan } }),
      },
    );
    if (matchedCount === 0) {
      await deleteScanFile(fileId);
      throw responseConflict();
    }
    // Not the file name: it may well name the customer.
    await recordAudit(
      {
        action: 'RESPONSE_UPDATED',
        actor: actor.id,
        entityType: 'ApplicationResponse',
        entityId: response._id,
        details: {
          applicationId: String(app._id),
          regNumber: await regNumberOf(app),
          outgoingNumber: response.outgoingNumber,
          changes: [{ field: 'scan', from: response.scan ? 'файл' : null, to: 'новий файл' }],
        },
      },
      context,
    );
    return responseDto(app, responseId);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

/** The current scan, or one replaced earlier (`fileId`), of a response the actor may see. */
export async function responseScanFile(
  applicationId: string,
  responseId: string,
  fileId: string | undefined,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const response = await loadResponse(app, responseId);
  const scan = fileId
    ? [response.scan, ...response.previousScans].find((s) => s?.fileId === fileId)
    : response.scan;
  if (!scan) throw ApiError.notFound('Скан не знайдено');
  return { path: scanPath(scan.fileId), name: scan.name };
}
