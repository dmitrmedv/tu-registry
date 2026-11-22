import {
  INVOICE_COMMENT_MAX,
  INVOICE_NUMBER_MAX,
  INVOICE_WORK_GROUPS,
  INVOICE_WORK_NAME_MAX,
  INVOICE_WORKS_MAX,
} from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { cancellationSchema } from '../documents/document.model';
import { scanRecordSchema } from '../scans/scanRecord.schema';

const workSchema = new Schema(
  {
    group: { type: String, enum: INVOICE_WORK_GROUPS, required: true },
    name: { type: String, required: true, trim: true, maxlength: INVOICE_WORK_NAME_MAX },
    // Kopecks: whole numbers add up exactly.
    amountKopecks: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

/**
 * «Рахунок» (2026-11-21): the bill for the connection under the valid project, several per
 * application (one per stage of construction). Dates are calendar dates (midnight UTC).
 */
const invoiceSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    // Given by the accounts department later (2026-11-22): null until then.
    invoiceNumber: { type: String, default: null, trim: true, maxlength: INVOICE_NUMBER_MAX },
    // The additional agreement it becomes (2026-11-22); none in the invoices before.
    agreementNumber: { type: Number, min: 1, default: null },
    invoiceDate: { type: Date, required: true },
    comment: { type: String, default: null, trim: true, maxlength: INVOICE_COMMENT_MAX },
    works: {
      type: [workSchema],
      required: true,
      validate: (works: unknown[]) => works.length >= 1 && works.length <= INVOICE_WORKS_MAX,
    },
    // The invoice's scan and the document it was made from, both PDF.
    scan: { type: scanRecordSchema, default: undefined },
    basis: { type: scanRecordSchema, default: undefined },
    cancellation: { type: cancellationSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'invoices' },
);

invoiceSchema.index({ applicationId: 1, invoiceDate: 1, createdAt: 1 });

export type InvoiceData = InferSchemaType<typeof invoiceSchema>;
export const Invoice = model('Invoice', invoiceSchema);
