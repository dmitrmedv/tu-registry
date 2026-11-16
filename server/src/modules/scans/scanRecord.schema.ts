import { SCAN_MAX_BYTES, SCAN_NAME_MAX } from '@tu-registry/shared';
import { Schema } from 'mongoose';

/**
 * A stored PDF as a document describes it: the file is on disk (scan.storage.ts), only its
 * description is here. Used by applications, responses and technical conditions.
 */
export const scanRecordSchema = new Schema(
  {
    fileId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: SCAN_NAME_MAX },
    size: { type: Number, required: true, min: 1, max: SCAN_MAX_BYTES },
    uploadedAt: { type: Date, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);
