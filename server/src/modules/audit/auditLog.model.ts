import { AUDIT_ACTIONS } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';
import { toJSONTransform } from '../../utils/toJSON';

/** Append-only journal of security-relevant actions. Never store passwords or tokens here. */
const auditLogSchema = new Schema(
  {
    // null for events without a known user (e.g. failed login with an unknown login).
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: String,
    // An ObjectId (users, applications) or a department's string id ("ODESA").
    entityId: Schema.Types.Mixed,
    details: Schema.Types.Mixed,
    ip: String,
    userAgent: { type: String, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: { transform: toJSONTransform() },
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export type AuditLogData = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
