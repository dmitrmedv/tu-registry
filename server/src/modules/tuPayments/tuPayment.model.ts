import { MONTH_PATTERN, TU_INVOICE_NUMBER_MAX, TU_PAYMENT_AMOUNT_MAX } from '@tu-registry/shared';
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
    receiptScan: { type: scanRecordSchema, default: undefined },
    actScan: { type: scanRecordSchema, default: undefined },
    // The month the act went to accounting, "YYYY-MM" (agreed 2026-11-19: a month, not a day).
    actTransferMonth: { type: String, match: MONTH_PATTERN, default: null },
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

export type TuPaymentData = InferSchemaType<typeof tuPaymentSchema>;
export const TuPayment = model('TuPayment', tuPaymentSchema);
