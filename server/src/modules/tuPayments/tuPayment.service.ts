import {
  type AuditAction,
  formatHryvnias,
  fromKopecks,
  type SaveTuPaymentData,
  toKopecks,
} from '@tu-registry/shared';
import type { ClientSession } from 'mongoose';
import { ApiError } from '../../utils/ApiError';
import { inTransaction, isDuplicateKey } from '../../utils/db';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import type { Actor } from '../applications/application.access';
import type { ApplicationDocument } from '../applications/application.dto';
import { loadEditableApplication } from '../applications/application.edit.service';
import { type RequestContext, recordAudit } from '../audit/audit.service';
import { assertDocumentDate, regNumberOf } from '../documents/document.rules';
import { loadChangeable, loadDocument } from '../documents/document.service';
import { deleteScanFile } from '../scans/scan.storage';
import {
  TECHNICAL_CONDITIONS,
  type TechnicalConditionsRecord,
  technicalConditionsDto,
} from '../technicalConditions/technicalConditions.service';
import { paymentFileIds, type TuPaymentRecord } from './tuPayment.dto';
import { TuPayment } from './tuPayment.model';

const ALREADY_ENTERED = 'Рахунок до цих технічних умов уже внесено. Оновіть сторінку.';
export const paymentConflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'Оплату щойно змінив інший користувач. Завантажте актуальні дані й повторіть зміни.',
  );
export const paymentNotFound = () => ApiError.notFound('Рахунок не знайдено');

/** The application and its valid technical conditions, both open to changes by `actor`. */
export async function loadPaymentTarget(applicationId: string, tuId: string, actor: Actor) {
  const app = await loadEditableApplication(applicationId, actor);
  return { app, tu: await loadChangeable(TECHNICAL_CONDITIONS, app, tuId) };
}

export function findPayment(tu: TechnicalConditionsRecord) {
  return TuPayment.findOne({ technicalConditionsId: tu._id }).lean<TuPaymentRecord>();
}

/** Our own numbers only: the invoice belongs to the TU, not to the customer's data. */
export async function auditPayment(
  action: AuditAction,
  actor: Actor,
  app: ApplicationDocument,
  tu: TechnicalConditionsRecord,
  payment: Pick<TuPaymentRecord, '_id' | 'invoiceNumber'>,
  context: RequestContext,
  extra: Record<string, unknown> = {},
  session?: ClientSession,
) {
  await recordAudit(
    {
      action,
      actor: actor.id,
      entityType: 'TuPayment',
      entityId: payment._id,
      details: {
        applicationId: String(app._id),
        regNumber: await regNumberOf(app),
        tuNumber: tu.tuNumber,
        invoiceNumber: payment.invoiceNumber,
        ...extra,
      },
    },
    context,
    session,
  );
}

const DATE_FIELDS = [
  ['invoiceDate', 'Дата рахунку'],
  ['paidDate', 'Дата оплати'],
  ['actTransferredDate', 'Дата передачі в бухгалтерію'],
] as const;

/**
 * Adds the payment (no `version`) or changes the one the user saw. Every date lies between
 * the registration and today; their order is checked by the shared schema.
 */
export async function saveTuPayment(
  applicationId: string,
  tuId: string,
  input: SaveTuPaymentData,
  actor: Actor,
  context: RequestContext,
) {
  const { app, tu } = await loadPaymentTarget(applicationId, tuId, actor);
  for (const [field, label] of DATE_FIELDS) {
    const value = input[field];
    if (value) assertDocumentDate(app, field, value, label);
  }
  const values = {
    invoiceNumber: input.invoiceNumber,
    invoiceDate: fromIsoDate(input.invoiceDate),
    amountKopecks: toKopecks(input.amount),
    paidDate: input.paidDate ? fromIsoDate(input.paidDate) : null,
    actTransferredDate: input.actTransferredDate ? fromIsoDate(input.actTransferredDate) : null,
  };
  const current = await findPayment(tu);

  if (input.version === undefined) {
    if (current) throw new ApiError(409, 'PAYMENT_EXISTS', ALREADY_ENTERED);
    let created;
    try {
      created = await TuPayment.create({
        ...values,
        technicalConditionsId: tu._id,
        applicationId: app._id,
        department: app.department,
        createdBy: actor.id,
      });
    } catch (error) {
      // Two users entering at once: the unique index lets one through.
      if (isDuplicateKey(error)) throw new ApiError(409, 'PAYMENT_EXISTS', ALREADY_ENTERED);
      throw error;
    }
    await auditPayment('TU_PAYMENT_CREATED', actor, app, tu, created, context, {
      invoiceDate: input.invoiceDate,
      amount: formatHryvnias(input.amount),
    });
    return technicalConditionsDto(app, tuId);
  }

  if (!current) throw paymentNotFound();
  if (input.version !== current.version) throw paymentConflict();
  const shown = {
    invoiceNumber: current.invoiceNumber,
    invoiceDate: toIsoDate(current.invoiceDate),
    amount: formatHryvnias(fromKopecks(current.amountKopecks)),
    paidDate: current.paidDate ? toIsoDate(current.paidDate) : null,
    actTransferredDate: current.actTransferredDate ? toIsoDate(current.actTransferredDate) : null,
  };
  const wanted = { ...input, amount: formatHryvnias(input.amount) };
  const changes = (Object.keys(shown) as (keyof typeof shown)[])
    .filter((field) => shown[field] !== wanted[field])
    .map((field) => ({ field, from: shown[field], to: wanted[field] }));
  if (changes.length === 0) return technicalConditionsDto(app, tuId);

  const { matchedCount } = await TuPayment.updateOne(
    { _id: current._id, version: current.version },
    { $set: { ...values, updatedBy: actor.id }, $inc: { version: 1 } },
  );
  if (matchedCount === 0) throw paymentConflict();
  await auditPayment(
    'TU_PAYMENT_UPDATED',
    actor,
    app,
    tu,
    { _id: current._id, invoiceNumber: input.invoiceNumber },
    context,
    { changes },
  );
  return technicalConditionsDto(app, tuId);
}

/**
 * Admin only (enforced by the route): removes the payment with both scans for good, also of
 * cancelled technical conditions (a mistake is a mistake). The audit keeps the invoice number.
 */
export async function deleteTuPayment(
  applicationId: string,
  tuId: string,
  version: number,
  actor: Actor,
  context: RequestContext,
) {
  const app = await loadEditableApplication(applicationId, actor);
  const tu = await loadDocument(TECHNICAL_CONDITIONS, app, tuId);
  const current = await findPayment(tu);
  if (!current) throw paymentNotFound();
  if (version !== current.version) throw paymentConflict();
  await inTransaction(async (session) => {
    const { deletedCount } = await TuPayment.deleteOne({ _id: current._id, version }, { session });
    if (deletedCount === 0) throw paymentConflict();
    await auditPayment('TU_PAYMENT_DELETED', actor, app, tu, current, context, {}, session);
  });
  // After the commit: a failed deletion must not lose the files of a payment still in place.
  await Promise.all(paymentFileIds([current]).map(deleteScanFile));
  return technicalConditionsDto(app, tuId);
}
