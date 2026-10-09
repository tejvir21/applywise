/** Refresh-token session registry (revocation list with TTL cleanup). */

import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRefreshSession extends Document {
  jti: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const refreshSessionSchema = new Schema<IRefreshSession>(
  {
    jti: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes expired rows automatically; logout/rotation delete eagerly.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSessionModel = mongoose.model<IRefreshSession>(
  'RefreshSession',
  refreshSessionSchema,
);
