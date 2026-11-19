import type { TuPaymentScanKind } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import type { Actor } from '../applications/application.access';
import { loadApplication } from '../applications/application.edit.service';
import type { RequestContext } from '../audit/audit.service';
import { loadDocument } from '../documents/document.service';
import {
  deleteScanFile,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import {
  TECHNICAL_CONDITIONS,
  technicalConditionsDto,
} from '../technicalConditions/technicalConditions.service';
import {
  auditPayment,
  findPayment,
  loadPaymentTarget,
  paymentConflict,
  paymentNotFound,
} from './tuPayment.service';
import { TuPayment } from './tuPayment.model';

type UploadedFile = { path: string; originalname: string; size: number };

const FIELD = { receipt: 'receiptScan', act: 'actScan' } as const;

/** A payment open to changes: of valid technical conditions of an editable application. */
async function loadScanEditable(applicationId: string, tuId: string, actor: Actor) {
  const { app, tu } = await loadPaymentTarget(applicationId, tuId, actor);
  const payment = await findPayment(tu);
  // The scans belong to an invoice: it is entered first.
  if (!payment) throw paymentNotFound();
  return { app, tu, payment };
}

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertScanEditable(applicationId: string, tuId: string, actor: Actor) {
  await loadScanEditable(applicationId, tuId, actor);
}

/**
 * Adds or replaces the receipt or the act. A replaced file is deleted: the payment keeps one
 * of each, and the audit records the change. Scans do not bump the version, like documents'.
 */
export async function attachPaymentScan(
  applicationId: string,
  tuId: string,
  kind: TuPaymentScanKind,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  try {
    const { app, tu, payment } = await loadScanEditable(applicationId, tuId, actor);
    if (!(await looksLikePdf(file.path))) {
      throw new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом');
    }
    const field = FIELD[kind];
    const previous = payment[field];
    const fileId = await storeScan(file.path);
    const scan = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The scan seen is the one replaced: a concurrent upload makes this one a conflict.
    const { matchedCount } = await TuPayment.updateOne(
      {
        _id: payment._id,
        [`${field}.fileId`]: previous ? previous.fileId : mongoose.trusted({ $exists: false }),
      },
      { $set: { [field]: scan, updatedBy: actor.id } },
    );
    if (matchedCount === 0) {
      await deleteScanFile(fileId);
      throw paymentConflict();
    }
    // Not the file name: it may well name the customer.
    await auditPayment('TU_PAYMENT_UPDATED', actor, app, tu, payment, context, {
      changes: [{ field, from: previous ? 'файл' : null, to: 'новий файл' }],
    });
    if (previous) await deleteScanFile(previous.fileId);
    return technicalConditionsDto(app, tuId);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removePaymentScan(
  applicationId: string,
  tuId: string,
  kind: TuPaymentScanKind,
  actor: Actor,
  context: RequestContext,
) {
  const { app, tu, payment } = await loadScanEditable(applicationId, tuId, actor);
  const field = FIELD[kind];
  const current = payment[field];
  if (!current) throw ApiError.notFound('Скан не знайдено');
  const { matchedCount } = await TuPayment.updateOne(
    { _id: payment._id, [`${field}.fileId`]: current.fileId },
    { $unset: { [field]: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw paymentConflict();
  await auditPayment('TU_PAYMENT_UPDATED', actor, app, tu, payment, context, {
    changes: [{ field, from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file of a scan still in place.
  await deleteScanFile(current.fileId);
  return technicalConditionsDto(app, tuId);
}

/** The receipt or the act of a visible application's payment, cancelled TU included. */
export async function paymentScanFile(
  applicationId: string,
  tuId: string,
  kind: TuPaymentScanKind,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const payment = await findPayment(await loadDocument(TECHNICAL_CONDITIONS, app, tuId));
  const scan = payment?.[FIELD[kind]];
  if (!scan) throw ApiError.notFound('Скан не знайдено');
  return { path: scanPath(scan.fileId), name: scan.name };
}
