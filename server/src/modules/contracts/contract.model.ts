import {
  CONNECTION_TYPES,
  CONTRACT_ADDRESS_MAX,
  CONTRACT_COMMENT_MAX,
  CONTRACT_CUSTOMER_MAX,
  CONTRACT_NUMBER_MAX,
  CONTRACT_REPRESENTATIVE_MAX,
} from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { cancellationSchema } from '../documents/document.model';
import { scanRecordSchema } from '../scans/scanRecord.schema';

/**
 * «Договір» (agreed 2026-11-20): made after the technical conditions, several per application
 * allowed. Dates are calendar dates (midnight UTC).
 */
const contractSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    // The TU the contract was made after, and their connection: the contract's kind.
    technicalConditionsId: {
      type: Schema.Types.ObjectId,
      ref: 'TechnicalConditions',
      required: true,
    },
    connectionType: { type: String, enum: CONNECTION_TYPES, required: true },
    contractNumber: { type: String, required: true, trim: true, maxlength: CONTRACT_NUMBER_MAX },
    // The department's sequence number when the number is ours («125-15»); null otherwise.
    sequence: { type: Number, default: null, min: 1 },
    contractDate: { type: Date, required: true },
    // Whose numbering the contract is in; the application's by default.
    department: { type: String, required: true },
    customer: { type: String, required: true, trim: true, maxlength: CONTRACT_CUSTOMER_MAX },
    address: { type: String, required: true, trim: true, maxlength: CONTRACT_ADDRESS_MAX },
    signedDate: { type: Date, default: null },
    // By power of attorney, when not the customer.
    representative: {
      type: String,
      default: null,
      trim: true,
      maxlength: CONTRACT_REPRESENTATIVE_MAX,
    },
    comment: { type: String, default: null, trim: true, maxlength: CONTRACT_COMMENT_MAX },
    // The Word document of the contract; the scan of the signed one.
    document: { type: scanRecordSchema, default: undefined },
    scan: { type: scanRecordSchema, default: undefined },
    cancellation: { type: cancellationSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'contracts' },
);

contractSchema.index({ applicationId: 1, contractDate: 1, createdAt: 1 });
// The next number is the department's largest + 1, cancelled contracts included; no number twice.
contractSchema.index(
  { department: 1, sequence: -1 },
  {
    unique: true,
    partialFilterExpression: { sequence: { $gte: 1 } },
    name: 'one_number_per_department',
  },
);

export type ContractData = InferSchemaType<typeof contractSchema>;
export const Contract = model('Contract', contractSchema);
