import {
  MONTH_PATTERN,
  TU_INVOICE_NUMBER_MAX,
  TU_PAYMENT_AMOUNT_MAX,
  TU_PAYMENT_CONTRACT_NUMBER_MAX,
} from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { scanRecordSchema } from '../scans/scanRecord.schema';

/**
 * «Оплата за технічні умови» (agreed 2026-11-19): one per set of technical conditions, filled
 * over time. Dates are calendar dates (midnight UTC); the sum is in kopecks.
 */
const tuPaymentSchema = new Schema(
  {
    technicalConditionsId: {
      type: Schema.Types.ObjectId,
      ref: 'TechnicalConditions',
      required: true,
    },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    // The application's: the future report on acts handed to accounting is per department.
    department: { type: String, required: true },
    invoiceNumber: { type: String, required: true, trim: true, maxlength: TU_INVOICE_NUMBER_MAX },
    invoiceDate: { type: Date, required: true },
    amountKopecks: {
      type: Number,
      required: true,
      min: 1,
      max: TU_PAYMENT_AMOUNT_MAX * 100,
      validate: { validator: Number.isInteger, message: 'Сума в копійках має бути цілою' },
    },
    paidDate: { type: Date, default: null },
    // What the bank actually took, which may differ from the invoice after rounding.
    paidAmountKopecks: {
      type: Number,
      default: null,
      min: 1,
      max: TU_PAYMENT_AMOUNT_MAX * 100,
      validate: {
        validator: (value: number | null) => value === null || Number.isInteger(value),
        message: 'Сума в копійках має бути цілою',
      },
    },
    invoiceScan: { type: scanRecordSchema, default: undefined },
    receiptScan: { type: scanRecordSchema, default: undefined },
    actScan: { type: scanRecordSchema, default: undefined },
    // The month the act went to accounting, "YYYY-MM" (agreed 2026-11-19: a month, not a day).
    actTransferMonth: { type: String, match: MONTH_PATTERN, default: null },
    // The contract for the payment (2026-11-20), rarely made: numbered 1, 2, 3… in the
    // department, never reset; the number only together with the date.
    contractNumber: {
      type: Number,
      default: null,
      min: 1,
      max: TU_PAYMENT_CONTRACT_NUMBER_MAX,
      validate: {
        validator: (value: number | null) => value === null || Number.isInteger(value),
        message: 'Номер договору має бути цілим',
      },
    },
    contractDate: { type: Date, default: null },
    // The signed contract's scan (PDF) and the contract as a Word document (DOCX).
    contractScan: { type: scanRecordSchema, default: undefined },
    contractDocument: { type: scanRecordSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'tuPayments' },
);

tuPaymentSchema.index({ technicalConditionsId: 1 }, { unique: true });
tuPaymentSchema.index({ applicationId: 1 });
// For the report on acts handed to accounting (a later task).
tuPaymentSchema.index({ department: 1, actTransferMonth: 1 });
// The next contract number is the department's largest + 1; no number twice in a department.
tuPaymentSchema.index(
  { department: 1, contractNumber: -1 },
  {
    unique: true,
    partialFilterExpression: { contractNumber: { $gte: 1 } },
    name: 'one_contract_number_per_department',
  },
);

export type TuPaymentData = InferSchemaType<typeof tuPaymentSchema>;
export const TuPayment = model('TuPayment', tuPaymentSchema);
