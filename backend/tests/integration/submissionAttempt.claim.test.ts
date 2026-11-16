import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';

describe('submission attempt claimExecuting concurrency', () => {
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
  });

  it('20 concurrent claims one winner', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k', requestFingerprint: 'fp', executionState: 'RESERVED' });
    const results = await Promise.all(Array.from({ length: 20 }, () => repo.claimExecuting(doc._id)));
    const winners = results.filter((r) => r !== null);
    expect(winners.length).toBe(1);
    const final = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((final as { executionState: string }).executionState).toBe('EXECUTING');
    expect((final as { startedAt?: Date }).startedAt).toBeTruthy();
  });

  it('claim rejected from non-RESERVED states', async () => {
    const states = ['REQUESTED','VALIDATING','EXECUTING','SUCCEEDED','FAILED','UNCERTAIN','REQUIRES_MANUAL_REVIEW'] as const;
    for (const s of states) {
      const doc = await SubmissionAttemptModel.create({ userId: new Types.ObjectId(), applicationId: new Types.ObjectId(), platform: 'linkedin', idempotencyKey: `k-${s}`, requestFingerprint: 'fp', executionState: s });
      const res = await repo.claimExecuting(doc._id);
      expect(res).toBeNull();
    }
  });
});
