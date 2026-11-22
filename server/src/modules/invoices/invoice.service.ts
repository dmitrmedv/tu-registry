import {
  type AuditAction,
  type CancelDocumentInput,
  type CreateInvoiceData,
  formatHryvnias,
  fromKopecks,
  EARTHWORKS_CONNECTION_POINT,
  INVOICE_NO_NUMBER,
  INVOICE_DEADLINE_DAYS,
  type InvoiceDto,
  invoiceTotals,
  type InvoiceWorkGroup,
  toKopecks,
} from '@tu-registry/shared';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { clock } from '../../utils/clock';
import { inTransaction } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadApplication, loadEditableApplication } from '../applications/application.edit.service';
import { type FieldChange, recordDocumentChange } from '../applications/applicationChange.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { loadExceptions } from '../calendar/calendar.service';
import { countWorkingDaysInclusive } from '../calendar/workingDays';
import type { ScanRecord } from '../documents/document.dto';
import { assertDocumentDate, fieldError, regNumberOf } from '../documents/document.rules';
import { Project } from '../projects/project.model';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { deleteStoredFile } from '../scans/scan.storage';
import { findUserSummaries } from '../users/user.service';
import { Invoice } from './invoice.model';

export type InvoiceRecord = {
  _id: Types.ObjectId;
  applicationId: Types.ObjectId;
  projectId: Types.ObjectId;
  invoiceNumber: string | null;
  agreementNumber?: number | null;
  invoiceDate: Date;
  comment?: string | null;
  works: { group: InvoiceWorkGroup; name: string; amountKopecks: number }[];
  scan?: ScanRecord | null;
  basis?: ScanRecord | null;
  cancellation?: { reason: string; at: Date; by: Types.ObjectId } | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  version: number;
};

export const invoiceConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Рахунок щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );
const invoiceNotFound = () => ApiError.notFound('Рахунок не знайдено');

/** The stored files of `rows`: for deleting them with the invoice or its application. */
export const invoiceFiles = (rows: Pick<InvoiceRecord, 'scan' | 'basis'>[]) =>
  rows.flatMap((row) =>
    [row.scan, row.basis]
      .filter((file) => !!file)
      .map((file) => ({ fileId: file.fileId, type: 'pdf' as const })),
  );

const worksOf = (row: Pick<InvoiceRecord, 'works'>) =>
  row.works.map((work) => ({
    group: work.group,
    name: work.name,
    amount: fromKopecks(work.amountKopecks),
  }));
const totalText = (row: Pick<InvoiceRecord, 'works'>) =>
  formatHryvnias(invoiceTotals(worksOf(row)).total);

/**
 * Journals a change of an invoice in the application's «Історія змін» and in the audit. Its
 * numbers and sums are our own: no customer data here.
 */
export async function auditInvoice(
  action: AuditAction,
  actor: Actor,
  app: ApplicationDocument,
  invoice: Pick<InvoiceRecord, '_id' | 'invoiceNumber'>,
  context: RequestContext,
  { changes, ...extra }: { changes?: FieldChange[] } & Record<string, unknown> = {},
  session?: ClientSession,
) {
  await recordDocumentChange(
    {
      applicationId: app._id,
      actorId: actor.id,
      action,
      document: {
        kind: 'INVOICE',
        id: invoice._id,
        number: invoice.invoiceNumber ?? INVOICE_NO_NUMBER,
      },
      changes,
    },
    session,
  );
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'Invoice',
      entityId: invoice._id,
      details: {
        applicationId: String(app._id),
        regNumber: await regNumberOf(app),
        invoiceNumber: invoice.invoiceNumber,
        ...extra,
        ...(changes && { changes }),
      },
    },
    context,
    session,
  );
}

/** The API shape: the totals, and the working days from the project's approval. */
async function toDtos(app: ApplicationDocument, rows: InvoiceRecord[]): Promise<InvoiceDto[]> {
  const projectIds = [...new Set(rows.map((row) => String(row.projectId)))];
  const [projects, exceptions, names] = await Promise.all([
    Project.find({ _id: mongoose.trusted({ $in: projectIds }) })
      .select('approvalDate')
      .lean<{ _id: Types.ObjectId; approvalDate: Date }[]>(),
    loadExceptions(toIsoDate(app.regDate)),
    findUserSummaries(
      rows.flatMap((row) => [
        String(row.createdBy),
        row.cancellation ? String(row.cancellation.by) : null,
        row.scan ? String(row.scan.uploadedBy) : null,
        row.basis ? String(row.basis.uploadedBy) : null,
      ]),
    ),
  ]);
  const approvals = new Map(projects.map((p) => [String(p._id), toIsoDate(p.approvalDate)]));
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
  return rows.map((row) => {
    const works = worksOf(row);
    const invoiceDate = toIsoDate(row.invoiceDate);
    // A project deleted since: its date is unknown, so is the term.
    const approval = approvals.get(String(row.projectId));
    const workingDays = approval ? countWorkingDaysInclusive(approval, invoiceDate, exceptions) : 0;
    return {
      id: String(row._id),
      applicationId: String(row.applicationId),
      projectId: String(row.projectId),
      invoiceNumber: row.invoiceNumber,
      agreementNumber: row.agreementNumber ?? null,
      invoiceDate,
      comment: row.comment ?? null,
      works,
      totals: invoiceTotals(works),
      workingDays,
      overdueBy: Math.max(0, workingDays - INVOICE_DEADLINE_DAYS),
      scan: fileDto(row.scan),
      basis: fileDto(row.basis),
      cancellation: row.cancellation
        ? {
            reason: row.cancellation.reason,
            at: row.cancellation.at.toISOString(),
            by: person(row.cancellation.by),
          }
        : null,
      createdBy: person(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      version: row.version,
    };
  });
}

/** An invoice of this application (another application's is "not found"). */
export async function loadInvoice(app: ApplicationDocument, id: string) {
  const invoice = await Invoice.findOne({ _id: id, applicationId: app._id }).lean<InvoiceRecord>();
  if (!invoice) throw invoiceNotFound();
  return invoice;
}

/** An invoice open to changes: of an editable application, not cancelled. */
export async function loadChangeableInvoice(applicationId: string, id: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  const invoice = await loadInvoice(app, id);
  if (invoice.cancellation) {
    throw new ApiError(409, 'DOCUMENT_CANCELLED', 'Рахунок скасовано: його не можна змінювати');
  }
  return { app, invoice };
}

export async function invoiceDto(app: ApplicationDocument, id: string) {
  return (await toDtos(app, [await loadInvoice(app, id)]))[0]!;
}

/** Every invoice of a visible application, cancelled ones too, in the order made. */
export async function listInvoices(applicationId: string, actor: Actor) {
  const app = await loadApplication(applicationId, actor);
  const rows = await Invoice.find({ applicationId: app._id })
    .sort({ invoiceDate: 1, createdAt: 1 })
    .lean<InvoiceRecord[]>();
  return toDtos(app, rows);
}

/** Not before the project's approval, nor after today; the term itself is only shown. */
async function assertInvoiceDate(
  app: ApplicationDocument,
  invoiceDate: string,
  approvalDate: Date,
) {
  await assertDocumentDate(app, 'invoiceDate', invoiceDate, 'Дата рахунку');
  const approval = toIsoDate(approvalDate);
  if (invoiceDate < approval) {
    throw fieldError(
      'invoiceDate',
      `Дата рахунку не може бути раніше дати узгодження проєкту (${approval.split('-').reverse().join('.')})`,
    );
  }
}

const hasEarthworks = (input: CreateInvoiceData) =>
  input.works.some((work) => work.group === 'EARTHWORKS');

/** Earthworks permits only where the technical conditions connect underground (2026-11-22). */
async function assertEarthworks(input: CreateInvoiceData, technicalConditionsId: Types.ObjectId) {
  if (!hasEarthworks(input)) return;
  const tu = await TechnicalConditions.findById(technicalConditionsId)
    .select('connectionPoint')
    .lean<{ connectionPoint: string }>();
  if (tu?.connectionPoint !== EARTHWORKS_CONNECTION_POINT) {
    throw fieldError(
      'works',
      'Дозволи на земляні роботи — лише коли точка приєднання — підземний газопровід',
    );
  }
}

const storedWorks = (input: CreateInvoiceData) =>
  input.works.map((work) => ({
    group: work.group,
    name: work.name,
    amountKopecks: toKopecks(work.amount),
  }));

/** Made under the valid project (agreed 2026-11-21); several per application. */
export async function createInvoice(
  applicationId: string,
  input: CreateInvoiceData,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const project = await Project.findOne({ applicationId: app._id, active: true })
    .select('approvalDate technicalConditionsId')
    .lean<{ _id: Types.ObjectId; approvalDate: Date; technicalConditionsId: Types.ObjectId }>();
  if (!project) {
    throw new ApiError(
      409,
      'NO_PROJECT',
      'Рахунок складається за чинним проєктом: спершу внесіть проєкт.',
    );
  }
  await assertInvoiceDate(app, input.invoiceDate, project.approvalDate);
  await assertEarthworks(input, project.technicalConditionsId);
  const created = await Invoice.create({
    applicationId: app._id,
    projectId: project._id,
    invoiceNumber: input.invoiceNumber,
    agreementNumber: input.agreementNumber,
    invoiceDate: fromIsoDate(input.invoiceDate),
    comment: input.comment,
    works: storedWorks(input),
    createdBy: actor.id,
  });
  const record = created.toObject() as unknown as InvoiceRecord;
  await auditInvoice('INVOICE_CREATED', actor, app, record, context, {
    invoiceDate: input.invoiceDate,
    agreementNumber: input.agreementNumber,
    total: totalText(record),
  });
  return invoiceDto(app, String(created._id));
}

/** Changes the invoice the user saw (`version`); the works are replaced as a whole. */
export async function updateInvoice(
  applicationId: string,
  id: string,
  input: CreateInvoiceData & { version: number },
  actor: Actor,
  context: RequestContext,
) {
  const { app, invoice } = await loadChangeableInvoice(applicationId, id, actor);
  if (input.version !== invoice.version) throw invoiceConflict();
  const changes: FieldChange[] = [];
  if (input.invoiceNumber !== invoice.invoiceNumber) {
    changes.push({ field: 'invoiceNumber', from: invoice.invoiceNumber, to: input.invoiceNumber });
  }
  const agreementNumber = invoice.agreementNumber ?? null;
  if (input.agreementNumber !== agreementNumber) {
    changes.push({ field: 'agreementNumber', from: agreementNumber, to: input.agreementNumber });
  }
  const comment = invoice.comment ?? null;
  if (input.comment !== comment) {
    changes.push({ field: 'comment', from: comment, to: input.comment });
  }
  const invoiceDate = toIsoDate(invoice.invoiceDate);
  if (input.invoiceDate !== invoiceDate) {
    const project = await Project.findById(invoice.projectId).select('approvalDate').lean();
    if (project) await assertInvoiceDate(app, input.invoiceDate, project.approvalDate);
    else await assertDocumentDate(app, 'invoiceDate', input.invoiceDate, 'Дата рахунку');
    changes.push({ field: 'invoiceDate', from: invoiceDate, to: input.invoiceDate });
  }
  const works = storedWorks(input);
  if (hasEarthworks(input)) {
    const project = await Project.findById(invoice.projectId)
      .select('technicalConditionsId')
      .lean<{ technicalConditionsId: Types.ObjectId }>();
    if (project) await assertEarthworks(input, project.technicalConditionsId);
  }
  if (
    JSON.stringify(works) !==
    JSON.stringify(
      invoice.works.map(({ group, name, amountKopecks }) => ({ group, name, amountKopecks })),
    )
  ) {
    // The works themselves are in the invoice; the journal keeps what they come to.
    changes.push({ field: 'works', from: totalText(invoice), to: totalText({ works }) });
  }
  if (changes.length === 0) return invoiceDto(app, id);

  const { matchedCount } = await Invoice.updateOne(
    { _id: invoice._id, version: invoice.version },
    {
      $set: {
        invoiceNumber: input.invoiceNumber,
        agreementNumber: input.agreementNumber,
        invoiceDate: fromIsoDate(input.invoiceDate),
        comment: input.comment,
        works,
        updatedBy: actor.id,
      },
      $inc: { version: 1 },
    },
  );
  if (matchedCount === 0) throw invoiceConflict();
  await auditInvoice(
    'INVOICE_UPDATED',
    actor,
    app,
    { _id: invoice._id, invoiceNumber: input.invoiceNumber },
    context,
    { changes },
  );
  return invoiceDto(app, id);
}

/** A cancelled invoice stays in the card (red frame) with its reason. */
export async function cancelInvoice(
  applicationId: string,
  id: string,
  input: CancelDocumentInput,
  actor: Actor,
  context: RequestContext,
) {
  const { app, invoice } = await loadChangeableInvoice(applicationId, id, actor);
  if (input.version !== invoice.version) throw invoiceConflict();
  const { matchedCount } = await Invoice.updateOne(
    { _id: invoice._id, version: invoice.version },
    {
      $set: { cancellation: { reason: input.reason, at: clock.now(), by: actor.id } },
      $inc: { version: 1 },
    },
  );
  if (matchedCount === 0) throw invoiceConflict();
  await auditInvoice('INVOICE_CANCELLED', actor, app, invoice, context);
  return invoiceDto(app, id);
}

/** Admin only (enforced by the route). */
export async function restoreInvoice(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const invoice = await loadInvoice(app, id);
  if (!invoice.cancellation) throw new ApiError(409, 'NOT_CANCELLED', 'Рахунок не скасовано');
  if (version !== invoice.version) throw invoiceConflict();
  const { matchedCount } = await Invoice.updateOne(
    { _id: invoice._id, version },
    { $unset: { cancellation: 1 }, $set: { updatedBy: actor.id }, $inc: { version: 1 } },
  );
  if (matchedCount === 0) throw invoiceConflict();
  await auditInvoice('INVOICE_RESTORED', actor, app, invoice, context);
  return invoiceDto(app, id);
}

/** Admin only (enforced by the route): the invoice and its files, for good. */
export async function deleteInvoice(
  applicationId: string,
  id: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const invoice = await loadInvoice(app, id);
  if (version !== invoice.version) throw invoiceConflict();
  await inTransaction(async (session) => {
    const { deletedCount } = await Invoice.deleteOne({ _id: invoice._id, version }, { session });
    if (deletedCount === 0) throw invoiceConflict();
    await auditInvoice('INVOICE_DELETED', actor, app, invoice, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of an invoice still in place.
  await Promise.all(
    invoiceFiles([invoice]).map(({ fileId, type }) => deleteStoredFile(fileId, type)),
  );
}
