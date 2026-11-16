import { type InferSchemaType, Schema, model } from 'mongoose';

/**
 * An engineer of a department (stage 17.1), chosen in technical conditions and responses.
 * The department never changes; an engineer is deactivated, never deleted, so documents that
 * name them keep their history.
 */
const engineerSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
    department: { type: String, required: true, immutable: true },
    isActive: { type: Boolean, default: true, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

// "Бойко А." and "бойко а." are one engineer within a department; lists sort by name with it.
engineerSchema.index(
  { department: 1, fullName: 1 },
  { unique: true, collation: { locale: 'uk', strength: 2 } },
);

export type EngineerData = InferSchemaType<typeof engineerSchema>;
export const Engineer = model('Engineer', engineerSchema);
