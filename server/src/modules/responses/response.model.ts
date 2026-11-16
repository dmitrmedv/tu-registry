import { CANCEL_REASON_MAX, OUTGOING_NUMBER_MAX } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { scanRecordSchema } from '../scans/scanRecord.schema';

/** Cancelling replaces deleting: a document that was part of the processing stays in history. */
export const cancellationSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: CANCEL_REASON_MAX },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

/**
 * A response to an application (stage 17.3), when technical conditions cannot be prepared
 * yet. Several per application; none closes it. Dates are calendar dates (midnight UTC).
 */
const responseSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    outgoingNumber: { type: String, required: true, trim: true, maxlength: OUTGOING_NUMBER_MAX },
    responseDate: { type: Date, required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'Engineer', required: true },
    // As it was when chosen: renaming or deactivating the engineer changes no history.
    engineerName: { type: String, required: true },
    // The customer brought the missing documents: processing goes on.
    documentsReceivedAt: { type: Date, default: undefined },
    scan: { type: scanRecordSchema, default: undefined },
    // Replaced scans are kept: they were part of the processing.
    previousScans: { type: [scanRecordSchema], default: [] },
    cancellation: { type: cancellationSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false },
);

responseSchema.index({ applicationId: 1, responseDate: 1, createdAt: 1 });

export type ResponseData = InferSchemaType<typeof responseSchema>;
export const ApplicationResponse = model('ApplicationResponse', responseSchema);
