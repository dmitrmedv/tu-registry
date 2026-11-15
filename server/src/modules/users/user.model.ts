import { DEPARTMENTS, ROLES } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { toJSONTransform } from '../../utils/toJSON';

const userSchema = new Schema(
  {
    login: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      match: /^[a-z0-9._-]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    // Users see and work with their department's applications (stage 13).
    department: { type: String, enum: DEPARTMENTS, required: true },
    role: { type: String, enum: ROLES, default: 'USER', required: true },
    // "Authorized" user: manual registration and changing date/number of own applications.
    canManageRegistration: { type: Boolean, default: false },
    // Users are never deleted (applications reference them), only deactivated.
    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { transform: toJSONTransform('passwordHash') },
  },
);

export type UserData = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
