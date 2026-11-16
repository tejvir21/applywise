import mongoose, { Types } from 'mongoose';
import { SubmissionAttemptModel, ISubmissionAttempt } from '../models/SubmissionAttempt.js';

export class SubmissionAttemptRepository {
  async findByKey(userId: Types.ObjectId, applicationId: Types.ObjectId, idempotencyKey: string) {
    return SubmissionAttemptModel.findOne({ userId, applicationId, idempotencyKey }).lean().exec();
  }
  async claimExecuting(id: Types.ObjectId) {
    return SubmissionAttemptModel.findOneAndUpdate(
      { _id: id, executionState: 'RESERVED' },
      { $set: { executionState: 'EXECUTING', startedAt: new Date() } },
      { new: true },
    ).lean().exec();
  }
  async createOrGet(userId: Types.ObjectId, applicationId: Types.ObjectId, platform: string, idempotencyKey: string, fingerprint: string, data: Partial<ISubmissionAttempt>) {
    const normalizedPlatform = platform.trim().toLowerCase();
    const safe: Partial<ISubmissionAttempt> = {
      reservationId: data.reservationId,
      errorDetails: data.errorDetails,
      uncertaintyDetails: data.uncertaintyDetails,
    };
    try {
      const created = await new SubmissionAttemptModel({ userId, applicationId, platform: normalizedPlatform, idempotencyKey, requestFingerprint: fingerprint, executionState: 'REQUESTED', ...safe }).save();
      return { attempt: created.toObject(), created: true };
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        const existing = await SubmissionAttemptModel.findOne({ userId, applicationId, idempotencyKey }).lean().exec();
        if (!existing) throw err;
        if ((existing as { requestFingerprint: string }).requestFingerprint !== fingerprint) {
          throw new Error('Fingerprint mismatch for idempotency key');
        }
        return { attempt: existing as unknown as ISubmissionAttempt, created: false };
      }
      throw err;
    }
  }
  async recordOutcome(id: Types.ObjectId, state: 'SUCCEEDED' | 'FAILED' | 'UNCERTAIN', outcome?: string, error?: string, uncertainty?: string) {
    return SubmissionAttemptModel.findOneAndUpdate(
      { _id: id, executionState: 'EXECUTING' },
      { $set: { executionState: state, adapterOutcome: outcome, errorDetails: error, uncertaintyDetails: uncertainty, completedAt: new Date() } },
      { new: true },
    ).lean().exec();
  }
  async reconcile(id: Types.ObjectId, resolution: 'confirmed_success' | 'confirmed_not_submitted' | 'unresolved', resolvedBy: Types.ObjectId, evidence?: string, session?: mongoose.ClientSession) {
    if (resolution !== 'unresolved') {
      if (!evidence || !evidence.trim()) throw new Error('Evidence required for resolution');
    }
    return SubmissionAttemptModel.findOneAndUpdate(
      { _id: id, executionState: { $in: ['UNCERTAIN', 'REQUIRES_MANUAL_REVIEW'] }, 'reconciliation.resolvedAt': { $exists: false } },
      { $set: { executionState: 'REQUIRES_MANUAL_REVIEW', reconciliation: { resolution, resolvedBy, evidence: evidence?.trim(), resolvedAt: new Date() } } },
      { new: true, session },
    ).lean().exec();
  }
}
