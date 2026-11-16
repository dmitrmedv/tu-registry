import { CANCEL_REASON_MAX } from '@tu-registry/shared';
import { Schema } from 'mongoose';

/** Cancelling replaces deleting: a document that was part of the processing stays in history. */
export const cancellationSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: CANCEL_REASON_MAX },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);
