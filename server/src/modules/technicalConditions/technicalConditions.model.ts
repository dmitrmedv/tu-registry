import {
  CONNECTION_POINTS,
  CONNECTION_TYPES,
  GAS_FLOW_MAX,
  GAS_PRESSURES,
  TU_NUMBER_MAX,
} from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { cancellationSchema } from '../documents/document.model';
import { scanRecordSchema } from '../scans/scanRecord.schema';

/**
 * Technical conditions prepared for an application (stage 17.4). One valid set per
 * application; cancelled ones stay in history. Dates are calendar dates (midnight UTC).
 */
const technicalConditionsSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    tuNumber: { type: String, required: true, trim: true, maxlength: TU_NUMBER_MAX },
    preparedDate: { type: Date, required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'Engineer', required: true },
    // As it was when chosen: renaming or deactivating the engineer changes no history.
    engineerName: { type: String, required: true },
    // m³/h.
    gasFlow: { type: Number, required: true, min: 0.001, max: GAS_FLOW_MAX },
    connectionType: { type: String, enum: CONNECTION_TYPES, required: true },
    gasPressure: { type: String, enum: GAS_PRESSURES, required: true },
    connectionPoint: { type: String, enum: CONNECTION_POINTS, required: true },
    scan: { type: scanRecordSchema, default: undefined },
    previousScans: { type: [scanRecordSchema], default: [] },
    cancellation: { type: cancellationSchema, default: undefined },
    // Not cancelled. A separate flag because a partial index cannot test for a missing field.
    active: { type: Boolean, default: true, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true, versionKey: false, collection: 'technicalConditions' },
);

// The final guarantee of "one valid technical conditions per application".
technicalConditionsSchema.index(
  { applicationId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_per_application' },
);
technicalConditionsSchema.index({ applicationId: 1, preparedDate: 1, createdAt: 1 });

export type TechnicalConditionsData = InferSchemaType<typeof technicalConditionsSchema>;
export const TechnicalConditions = model('TechnicalConditions', technicalConditionsSchema);
