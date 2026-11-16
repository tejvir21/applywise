import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';

describe('submission attempt outcome persistence', () => {
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

  async function claimed() {
    const doc = await SubmissionAttemptModel.create({ userId: new Types.ObjectId(), applicationId: new Types.ObjectId(), platform: 'linkedin', idempotencyKey: `k-${Date.now()}-${Math.random()}`, requestFingerprint: 'fp', executionState: 'RESERVED' });
    await repo.claimExecuting(doc._id);
    return doc._id;
  }

  it('success outcome', async () => {
    const id = await claimed();
    const res = await repo.recordOutcome(id, 'SUCCEEDED', 'success');
    expect(res).not.toBeNull();
    const doc = await SubmissionAttemptModel.findById(id).lean();
    expect((doc as { executionState: string }).executionState).toBe('SUCCEEDED');
    expect((doc as { adapterOutcome: string }).adapterOutcome).toBe('success');
    expect((doc as { completedAt?: Date }).completedAt).toBeTruthy();
  });

  it('failed outcome', async () => {
    const id = await claimed();
    await repo.recordOutcome(id, 'FAILED', 'failure', 'boom');
    const doc = await SubmissionAttemptModel.findById(id).lean();
    expect((doc as { executionState: string }).executionState).toBe('FAILED');
    expect((doc as { adapterOutcome: string }).adapterOutcome).toBe('failure');
    expect((doc as { errorDetails?: string }).errorDetails).toBe('boom');
    expect((doc as { completedAt?: Date }).completedAt).toBeTruthy();
  });

  it('uncertain outcome', async () => {
    const id = await claimed();
    await repo.recordOutcome(id, 'UNCERTAIN', 'uncertain', undefined, 'timeout');
    const doc = await SubmissionAttemptModel.findById(id).lean();
    expect((doc as { executionState: string }).executionState).toBe('UNCERTAIN');
    expect((doc as { uncertaintyDetails?: string }).uncertaintyDetails).toBe('timeout');
    const claim = await repo.claimExecuting(id);
    expect(claim).toBeNull();
  });

  it('concurrent outcome protection', async () => {
    const id = await claimed();
    const results = await Promise.all([
      repo.recordOutcome(id, 'SUCCEEDED', 'success'),
      repo.recordOutcome(id, 'FAILED', 'failure'),
    ]);
    const winners = results.filter((r) => r !== null);
    expect(winners.length).toBe(1);
    const doc = await SubmissionAttemptModel.findById(id).lean();
    const state = (doc as { executionState: string }).executionState;
    expect(['SUCCEEDED', 'FAILED']).toContain(state);
    // second call should not overwrite
    await repo.recordOutcome(id, 'UNCERTAIN', 'uncertain');
    const doc2 = await SubmissionAttemptModel.findById(id).lean();
    expect((doc2 as { executionState: string }).executionState).toBe(state);
  });

  it('invalid transitions', async () => {
    const states = ['REQUESTED','VALIDATING','RESERVED','SUCCEEDED','FAILED','UNCERTAIN','REQUIRES_MANUAL_REVIEW'] as const;
    for (const s of states) {
      const doc = await SubmissionAttemptModel.create({ userId: new Types.ObjectId(), applicationId: new Types.ObjectId(), platform: 'linkedin', idempotencyKey: `k-${s}`, requestFingerprint: 'fp', executionState: s });
      const res = await repo.recordOutcome(doc._id, 'SUCCEEDED', 'success');
      expect(res).toBeNull();
    }
  });
});
