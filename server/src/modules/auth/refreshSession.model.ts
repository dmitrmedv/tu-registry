import { type InferSchemaType, Schema, model } from 'mongoose';

/** A login session. Only a SHA-256 hash of the refresh token is stored, never the token. */
const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    // null while active, so queries can filter on { revokedAt: null } without operators.
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// TTL index: MongoDB removes sessions automatically once expiresAt has passed.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshSessionData = InferSchemaType<typeof refreshSessionSchema>;
export const RefreshSession = model('RefreshSession', refreshSessionSchema);
