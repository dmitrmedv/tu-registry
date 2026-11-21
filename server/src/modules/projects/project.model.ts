import { PROJECT_APPROVAL_NUMBER_MAX } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { cancellationSchema } from '../documents/document.model';
import { scanRecordSchema } from '../scans/scanRecord.schema';

/**
 * «Проєкт» (2026-11-21): the approval of the connection project, under the technical conditions
 * valid when it was entered. One valid project per application; cancelled ones stay in history.
 * Dates are calendar dates (midnight UTC).
 */
const projectSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    technicalConditionsId: {
      type: Schema.Types.ObjectId,
      ref: 'TechnicalConditions',
      required: true,
    },
    approvalNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: PROJECT_APPROVAL_NUMBER_MAX,
    },
    approvalDate: { type: Date, required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'Engineer', required: true },
    // As it was when chosen: renaming or deactivating the engineer changes no history.
    engineerName: { type: String, required: true },
    scan: { type: scanRecordSchema, default: undefined },
    previousScans: { type: [scanRecordSchema], default: [] },
    cancellation: { type: cancellationSchema, default: undefined },
    // Not cancelled. A separate flag because a partial index cannot test for a missing field.
    active: { type: Boolean, default: true, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'projects' },
);

// The final guarantee of "one valid project per application".
projectSchema.index(
  { applicationId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_application' },
);
projectSchema.index({ applicationId: 1, approvalDate: 1, createdAt: 1 });

export type ProjectData = InferSchemaType<typeof projectSchema>;
export const Project = model('Project', projectSchema);
