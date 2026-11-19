import type { AuditAction, CancelDocumentInput, HistoryDocumentKind } from '@tu-registry/shared';
import mongoose, { type ClientSession, type Model } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { type FieldChange, recordDocumentChange } from '../applications/applicationChange.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import {
  deleteScanFile,
  looksLikePdf,
  removeFile,
  scanDisplayName,
  scanPath,
  storeScan,
} from '../scans/scan.storage';
import type { DocumentRecord } from './document.dto';
import { recomputeProcessing } from '../processing/processing.summary';
import { regNumberOf } from './document.rules';

type UploadedFile = { path: string; originalname: string; size: number };

/**
 * What differs between responses and technical conditions for the shared operations below:
 * their collection, audit entries and the words used in messages.
 */
export type DocumentKind<R extends DocumentRecord> = {
  // The two models have different document types; the shared code only filters by _id,
  // version and applicationId and reads documents back as `R`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  model: Model<any>;
  entityType: 'ApplicationResponse' | 'TechnicalConditions';
  actions: { updated: AuditAction; cancelled: AuditAction; restored: AuditAction };
  /** Our own numbers and dates for the audit entry; customer data never goes there. */
  auditDetails: (record: R) => Record<string, unknown>;
  /** The document in the application's «Історія змін». */
  history: { kind: HistoryDocumentKind; number: (record: R) => string };
  messages: {
    notFound: string;
    conflict: string;
    cancelled: string;
    notCancelled: string;
    /** Restoring would break a unique rule (one valid technical conditions). */
    restoreTaken?: string;
  };
  /** Set together with cancelling and restoring (technical conditions toggle `active`). */
  onCancel?: Record<string, unknown>;
  onRestore?: Record<string, unknown>;
};

export const versionConflict = (kind: { messages: { conflict: string } }) =>
  new ApiError(409, 'VERSION_CONFLICT', kind.messages.conflict);

/** Customer data: its values go to the application's history, never to the audit. */
const CUSTOMER_FIELDS = new Set(['customer', 'address']);

/**
 * Journals a change of a document twice: in the application's «Історія змін» (with the values)
 * and in the audit (our own numbers only). Every change of a document goes through here.
 */
export async function auditDocument<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  action: AuditAction,
  actor: Actor,
  app: ApplicationDocument,
  record: R,
  context: RequestContext,
  { changes, ...extra }: { changes?: FieldChange[] } & Record<string, unknown> = {},
  session?: ClientSession,
) {
  await recordDocumentChange(
    {
      applicationId: app._id,
      actorId: actor.id,
      action,
      document: { kind: kind.history.kind, id: record._id, number: kind.history.number(record) },
      changes,
    },
    session,
  );
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: kind.entityType,
      entityId: record._id,
      details: {
        applicationId: String(app._id),
        regNumber: await regNumberOf(app),
        ...kind.auditDetails(record),
        ...extra,
        ...(changes && {
          changes: changes.map((change) =>
            CUSTOMER_FIELDS.has(change.field) ? { field: change.field } : change,
          ),
        }),
      },
    },
    context,
    session,
  );
}

/** A document of this application (another application's is "not found"). */
export async function loadDocument<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  app: ApplicationDocument,
  id: string,
) {
  const record = await kind.model.findOne({ _id: id, applicationId: app._id }).lean<R>();
  if (!record) throw ApiError.notFound(kind.messages.notFound);
  return record;
}

/** A document that may be changed: not cancelled, and as the user saw it (`version`). */
export async function loadChangeable<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  app: ApplicationDocument,
  id: string,
  version?: number,
) {
  const current = await loadDocument(kind, app, id);
  if (current.cancellation) throw new ApiError(409, 'DOCUMENT_CANCELLED', kind.messages.cancelled);
  if (version !== undefined && version !== current.version) throw versionConflict(kind);
  return current;
}

/** Applies `update` to the version seen, or reports that someone else changed it first. */
export async function updateSeen<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  current: R,
  update: Record<string, unknown>,
  session?: ClientSession,
) {
  const { matchedCount } = await kind.model.updateOne(
    { _id: current._id, version: current.version },
    update,
    { session },
  );
  if (matchedCount === 0) throw versionConflict(kind);
}

/**
 * A change of the application's documents together with its processing summary: both are
 * written, or neither (a refused change leaves the summary as it was).
 */
export function changeDocuments<T>(
  app: ApplicationDocument,
  work: (session: ClientSession) => Promise<T>,
) {
  return inTransaction(async (session) => {
    const result = await work(session);
    await recomputeProcessing(app._id, session);
    return result;
  });
}

export async function cancelDocument<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  app: ApplicationDocument,
  id: string,
  input: CancelDocumentInput,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadChangeable(kind, app, id, input.version);
  await changeDocuments(app, (session) =>
    updateSeen(
      kind,
      current,
      {
        $set: {
          cancellation: { reason: input.reason, at: clock.now(), by: actor.id },
          updatedBy: actor.id,
          ...kind.onCancel,
        },
        $inc: { version: 1 },
      },
      session,
    ),
  );
  // The reason is free text and may name the customer: it stays with the document only.
  await auditDocument(kind, kind.actions.cancelled, actor, app, current, context);
}

/** Admins only (enforced by the routes). */
export async function restoreDocument<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  app: ApplicationDocument,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const current = await loadDocument(kind, app, id);
  if (!current.cancellation) {
    throw new ApiError(409, 'NOT_CANCELLED', kind.messages.notCancelled);
  }
  if (version !== current.version) throw versionConflict(kind);
  try {
    await changeDocuments(app, (session) =>
      updateSeen(
        kind,
        current,
        {
          $unset: { cancellation: 1 },
          $set: { updatedBy: actor.id, ...kind.onRestore },
          $inc: { version: 1 },
        },
        session,
      ),
    );
  } catch (error) {
    if (isDuplicateKey(error) && kind.messages.restoreTaken) {
      throw new ApiError(409, 'DOCUMENT_TAKEN', kind.messages.restoreTaken);
    }
    throw error;
  }
  await auditDocument(kind, kind.actions.restored, actor, app, current, context);
}

/**
 * Adds or replaces a document's scan. A replaced scan is kept among `previousScans`: it was
 * part of the processing. Scans do not bump the version, like the application's own scan.
 * `load` checks access again (it was checked before the file was read) and returns the
 * document as changeable; the application is returned for the caller's DTO.
 */
export async function attachDocumentScan<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  load: () => Promise<{ app: ApplicationDocument; current: R }>,
  file: UploadedFile,
  actor: Actor,
  context: RequestContext,
) {
  try {
    const { app, current } = await load();
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
    const { matchedCount } = await kind.model.updateOne(
      {
        _id: current._id,
        cancellation: mongoose.trusted({ $exists: false }),
        'scan.fileId': current.scan ? current.scan.fileId : mongoose.trusted({ $exists: false }),
      },
      {
        $set: { scan, updatedBy: actor.id },
        ...(current.scan && { $push: { previousScans: current.scan } }),
      },
    );
    if (matchedCount === 0) {
      await deleteScanFile(fileId);
      throw versionConflict(kind);
    }
    // Not the file name: it may well name the customer.
    await auditDocument(kind, kind.actions.updated, actor, app, current, context, {
      changes: [{ field: 'scan', from: current.scan ? 'файл' : null, to: 'новий файл' }],
    });
    return app;
  } finally {
    // Whatever happened, nothing stays in the upload folder (a moved file is already gone).
    await removeFile(file.path);
  }
}

/**
 * Removes a document's current scan, e.g. a wrong file (agreed 2026-11-17): like the
 * application's own scan, the file is deleted for good; scans replaced earlier stay. `load`
 * checks access and returns the document as changeable.
 */
export async function removeDocumentScan<R extends DocumentRecord>(
  kind: DocumentKind<R>,
  load: () => Promise<{ app: ApplicationDocument; current: R }>,
  actor: Actor,
  context: RequestContext,
) {
  const { app, current } = await load();
  if (!current.scan) throw ApiError.notFound('У документа немає скану');
  // The scan seen is the one removed: a concurrent upload makes this a conflict.
  const { matchedCount } = await kind.model.updateOne(
    {
      _id: current._id,
      cancellation: mongoose.trusted({ $exists: false }),
      'scan.fileId': current.scan.fileId,
    },
    { $unset: { scan: 1 }, $set: { updatedBy: actor.id } },
  );
  if (matchedCount === 0) throw versionConflict(kind);
  await auditDocument(kind, kind.actions.updated, actor, app, current, context, {
    changes: [{ field: 'scan', from: 'файл', to: null }],
  });
  // After the change: a refused removal must not lose the file of a scan still in place.
  await deleteScanFile(current.scan.fileId);
  return app;
}

/** The current scan, or one replaced earlier (`fileId`), of a document the actor may see. */
export function documentScanFile(record: DocumentRecord, fileId: string | undefined) {
  const scan = fileId
    ? [record.scan, ...record.previousScans].find((s) => s?.fileId === fileId)
    : record.scan;
  if (!scan) throw ApiError.notFound('Скан не знайдено');
  return { path: scanPath(scan.fileId), name: scan.name };
}
