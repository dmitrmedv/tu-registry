import { PREFERENCE_TABLES } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';

/** One user's layout of one table (agreed 2026-11-19): only what they changed. */
const userPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    table: { type: String, enum: PREFERENCE_TABLES, required: true },
    visible: { type: Map, of: Boolean, default: () => new Map() },
    widths: { type: Map, of: Number, default: () => new Map() },
    order: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

userPreferenceSchema.index({ userId: 1, table: 1 }, { unique: true });

export type UserPreferenceData = InferSchemaType<typeof userPreferenceSchema>;
export const UserPreference = model('UserPreference', userPreferenceSchema, 'userPreferences');
