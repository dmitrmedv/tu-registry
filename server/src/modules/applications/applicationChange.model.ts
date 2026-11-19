import { APPLICATION_CHANGE_ACTIONS, HISTORY_DOCUMENT_KINDS } from '@tu-registry/shared';
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

/** The document a change was made to, with its number then (it may change or go later). */
const changedDocumentSchema = new Schema(
  {
    kind: { type: String, enum: HISTORY_DOCUMENT_KINDS, required: true },
    id: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
  },
  { _id: false },
);

/**
 * One document per save: who changed which fields of an application, or of one of its
 * documents (`document`), and how.
 */
const applicationChangeSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now, required: true },
    action: { type: String, enum: APPLICATION_CHANGE_ACTIONS, required: true },
    document: { type: changedDocumentSchema, default: null },
    changes: { type: [fieldChangeSchema], default: [] },
  },
  { versionKey: false, toJSON: { transform: toJSONTransform() } },
);

applicationChangeSchema.index({ applicationId: 1, changedAt: -1 });

export type ApplicationChangeData = InferSchemaType<typeof applicationChangeSchema>;
export const ApplicationChange = model('ApplicationChange', applicationChangeSchema);
