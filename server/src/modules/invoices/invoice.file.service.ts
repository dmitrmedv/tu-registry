import type { InvoiceFileKind } from '@tu-registry/shared';
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
import {
  auditInvoice,
  invoiceConflict,
  invoiceDto,
  loadChangeableInvoice,
  loadInvoice,
} from './invoice.service';
import { Invoice } from './invoice.model';

type UploadedFile = { path: string; originalname: string; size: number };

/** Checked before the file is read (a refusal costs no upload), and again when it is stored. */
export async function assertFileEditable(applicationId: string, id: string, actor: Actor) {
  await loadChangeableInvoice(applicationId, id, actor);
}

/**
 * Adds or replaces the invoice's scan or its basis document (both PDF, agreed 2026-11-21). A
 * replaced file is deleted; the audit records the change. Files do not bump the version.
 */
export async function attachInvoiceFile(
  applicationId: string,
  id: string,
  kind: InvoiceFileKind,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  try {
    const { app, invoice } = await loadChangeableInvoice(applicationId, id, actor);
    if (!(await looksLikePdf(file.path))) {
      throw new ApiError(400, 'SCAN_NOT_PDF', 'Файл не є PDF-документом');
    }
    const previous = invoice[kind];
    const fileId = await storeScan(file.path, 'pdf');
    const stored = {
      fileId,
      name: scanDisplayName(file.originalname),
      size: file.size,
      uploadedAt: clock.now(),
      uploadedBy: actor.id,
    };
    // The file seen is the one replaced: a concurrent upload makes this one a conflict.
    const { matchedCount } = await Invoice.updateOne(
      {
        _id: invoice._id,
        [`${kind}.fileId`]: previous ? previous.fileId : mongoose.trusted({ $exists: false }),
      },
      { $set: { [kind]: stored, updatedBy: actor.id } },
    );
    if (matchedCount === 0) {
      await deleteStoredFile(fileId, 'pdf');
      throw invoiceConflict();
    }
    // Not the file name: it may well name the customer.
    await auditInvoice('INVOICE_UPDATED', actor, app, invoice, context, {
      changes: [{ field: kind, from: previous ? 'файл' : null, to: 'новий файл' }],
    });
    if (previous) await deleteStoredFile(previous.fileId, 'pdf');
    return invoiceDto(app, id);
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

export async function removeInvoiceFile(
  applicationId: string,
  id: string,
  kind: InvoiceFileKind,
  actor: Actor,
  context: RequestContext,
) {
  const { app, invoice } = await loadChangeableInvoice(applicationId, id, actor);
  const current = invoice[kind];
  if (!current) throw ApiError.notFound('Файл не знайдено');
  const { matchedCount } = await Invoice.updateOne(
    { _id: invoice._id, [`${kind}.fileId`]: current.fileId },
    { $unset: { [kind]: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw invoiceConflict();
  await auditInvoice('INVOICE_UPDATED', actor, app, invoice, context, {
    changes: [{ field: kind, from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file still in place.
  await deleteStoredFile(current.fileId, 'pdf');
  return invoiceDto(app, id);
}

/** A file of a visible application's invoice, a cancelled one included. */
export async function invoiceFile(
  applicationId: string,
  id: string,
  kind: InvoiceFileKind,
  actor: Actor,
) {
  const app = await loadApplication(applicationId, actor);
  const stored = (await loadInvoice(app, id))[kind];
  if (!stored) throw ApiError.notFound('Файл не знайдено');
  return { path: scanPath(stored.fileId, 'pdf'), name: stored.name, type: 'pdf' as const };
}
