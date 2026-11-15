import { DEPARTMENT_CODE_MAX, DEPARTMENT_NAME_MAX } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';

/**
 * A regional department (stage 14.2). The string id is what users and applications store:
 * the initial ones keep their readable ids ("ODESA"), new ones get a generated one.
 */
const departmentSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: DEPARTMENT_NAME_MAX },
    // Goes into registration numbers ("15т/26-8"); unique so a number names one department.
    code: { type: Number, required: true, min: 1, max: DEPARTMENT_CODE_MAX },
    // Archived: kept with its users and applications, but nothing new goes into it.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

departmentSchema.index({ code: 1 }, { unique: true });
// "Одеське" and "одеське" are the same department.
departmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'uk', strength: 2 } });

export type DepartmentData = InferSchemaType<typeof departmentSchema>;
export const Department = model('Department', departmentSchema);
