import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { SubmissionAttemptRepository } from '../repositories/SubmissionAttemptRepository.js';
import { ApplicationEventModel } from '../models/Application.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const repo = new SubmissionAttemptRepository();

export type ReconciliationResolution = 'confirmed_success' | 'confirmed_not_submitted' | 'unresolved';

export async function reconcileSubmissionAttempt(
  actorId: Types.ObjectId,
  attemptId: string,
  resolution: ReconciliationResolution,
  evidence?: string,
): Promise<void> {
  const session = await mongoose.startSession();
  try {
    let committed = false;
    await session.withTransaction(async () => {
      const attempt = await (await import('../models/SubmissionAttempt.js')).SubmissionAttemptModel.findById(attemptId).session(session).lean().exec();
      if (!attempt) throw new NotFoundError('SubmissionAttempt', attemptId);
      if ((attempt as { userId: Types.ObjectId }).userId.toString() !== actorId.toString()) {
        throw new ValidationError('Unauthorized reconciliation', { actorId: actorId.toString() });
      }
      if (resolution !== 'unresolved') {
        if (!evidence || !evidence.trim()) throw new ValidationError('Evidence required', { resolution });
      }
      const prev = await repo.reconcile(new Types.ObjectId(attemptId), resolution, actorId, evidence?.trim(), session);
      if (!prev) throw new ValidationError('Reconciliation not allowed', { attemptId });
      await ApplicationEventModel.create([{ applicationId: (attempt as { applicationId: Types.ObjectId }).applicationId, userId: actorId, type: 'submission_reconciled', message: `Attempt ${attemptId} reconciled as ${resolution}` }], { session });
    });
    return;
  } finally {
    await session.endSession();
  }
}
