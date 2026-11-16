import mongoose, { Document, Schema, Types } from 'mongoose';
import crypto from 'crypto';

export type ExecutionState = 'REQUESTED' | 'VALIDATING' | 'RESERVED' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'UNCERTAIN' | 'REQUIRES_MANUAL_REVIEW';

export interface ISubmissionAttempt extends Document {
  userId: Types.ObjectId;
  applicationId: Types.ObjectId;
  platform: string;
  idempotencyKey: string;
  requestFingerprint: string;
  reservationId?: string;
  executionState: ExecutionState;
  adapterOutcome?: 'success' | 'failure' | 'uncertain';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorDetails?: string;
  uncertaintyDetails?: string;
  reconciliation?: { resolvedBy?: Types.ObjectId; resolution?: 'confirmed_success' | 'confirmed_not_submitted' | 'unresolved'; evidence?: string; resolvedAt?: Date };
  updatedAt: Date;
}

const submissionAttemptSchema = new Schema<ISubmissionAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    applicationId: { type: Schema.Types.ObjectId, required: true, ref: 'Application', index: true },
    platform: { type: String, required: true, trim: true, maxlength: 50 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 100 },
    requestFingerprint: { type: String, required: true, trim: true, maxlength: 128 },
    reservationId: { type: String, trim: true, maxlength: 100 },
    executionState: { type: String, required: true, enum: ['REQUESTED','VALIDATING','RESERVED','EXECUTING','SUCCEEDED','FAILED','UNCERTAIN','REQUIRES_MANUAL_REVIEW'], default: 'REQUESTED' },
    adapterOutcome: { type: String, trim: true, maxlength: 50, enum: ['success', 'failure', 'uncertain'] },
    startedAt: { type: Date },
    completedAt: { type: Date },
    errorDetails: { type: String, trim: true, maxlength: 2000 },
    uncertaintyDetails: { type: String, trim: true, maxlength: 2000 },
    reconciliation: {
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      resolution: { type: String, trim: true, maxlength: 50, enum: ['confirmed_success', 'confirmed_not_submitted', 'unresolved'] },
      evidence: { type: String, trim: true, maxlength: 2000 },
      resolvedAt: { type: Date },
    },
  },
  { timestamps: true },
);

submissionAttemptSchema.index({ userId: 1, applicationId: 1, idempotencyKey: 1 }, { unique: true });

export const SubmissionAttemptModel = mongoose.model<ISubmissionAttempt>('SubmissionAttempt', submissionAttemptSchema);

export function computeRequestFingerprint(input: { applicationId: string; platform: string; materialsHash: string; resumeVersion?: number }): string {
  if (!input.applicationId || !input.platform || !input.materialsHash) throw new Error('Missing fingerprint inputs');
  const canonical = JSON.stringify({
    applicationId: input.applicationId,
    platform: input.platform.trim().toLowerCase(),
    materialsHash: input.materialsHash,
    resumeVersion: input.resumeVersion ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
