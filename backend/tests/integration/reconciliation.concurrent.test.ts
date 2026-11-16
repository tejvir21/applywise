import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { reconcileSubmissionAttempt } from '../../src/services/SubmissionReconciliationService.js';
import { ApplicationEventModel } from '../../src/models/Application.js';

describe('reconciliation concurrent', () => {
  let replSet: MongoMemoryReplSet;
  const repo = new SubmissionAttemptRepository();
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    await SubmissionAttemptModel.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
  beforeEach(async () => {
    await SubmissionAttemptModel.deleteMany({});
    await ApplicationEventModel.deleteMany({});
  });

  it('10 concurrent reconciliations one winner', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k', requestFingerprint: 'fp', executionState: 'RESERVED' });
    await repo.claimExecuting(doc._id);
    await repo.recordOutcome(doc._id, 'UNCERTAIN', 'uncertain', undefined, 'timeout');

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', `evidence-${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(1);

    const after = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after as { reconciliation: { resolution: string } }).reconciliation.resolution).toBe('confirmed_success');

    const events = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events.length).toBe(1);
  });
});
