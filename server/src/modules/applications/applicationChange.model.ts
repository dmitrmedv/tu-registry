import { APPLICATION_CHANGE_ACTIONS } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { toJSONTransform } from '../../utils/toJSON';

const fieldChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
  },
  { _id: false },
);

/** One document per save: who changed which fields of an application and how. */
const applicationChangeSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now, required: true },
    action: { type: String, enum: APPLICATION_CHANGE_ACTIONS, required: true },
    changes: { type: [fieldChangeSchema], default: [] },
  },
  { versionKey: false, toJSON: { transform: toJSONTransform() } },
);

applicationChangeSchema.index({ applicationId: 1, changedAt: -1 });

export type ApplicationChangeData = InferSchemaType<typeof applicationChangeSchema>;
export const ApplicationChange = model('ApplicationChange', applicationChangeSchema);
