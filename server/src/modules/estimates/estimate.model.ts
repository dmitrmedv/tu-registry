import { type InferSchemaType, Schema, model } from 'mongoose';
import { scanRecordSchema } from '../scans/scanRecord.schema';

const supersededSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

/**
 * «Кошторис» (2026-11-21): split from the project, so it can be recalculated without the project
 * being approved again. A recalculation adds a new estimate and marks the current one superseded;
 * superseded ones keep their files. The check date is a calendar date (midnight UTC).
 */
const estimateSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    checkDate: { type: Date, default: null },
    // Kopecks: whole numbers add up exactly.
    amountKopecks: { type: Number, default: null, min: 1 },
    // Its scan (PDF) and the check file (.imd).
    scan: { type: scanRecordSchema, default: undefined },
    imd: { type: scanRecordSchema, default: undefined },
    superseded: { type: supersededSchema, default: undefined },
    // Not superseded. A separate flag because a partial index cannot test for a missing field.
    active: { type: Boolean, default: true, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'estimates' },
);

// The final guarantee of "one current estimate per project".
estimateSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_project' },
);
estimateSchema.index({ applicationId: 1, createdAt: 1 });

export type EstimateData = InferSchemaType<typeof estimateSchema>;
export const Estimate = model('Estimate', estimateSchema);
