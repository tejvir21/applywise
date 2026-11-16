import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { reconcileSubmissionAttempt } from '../../src/services/SubmissionReconciliationService.js';
import { ApplicationEventModel } from '../../src/models/Application.js';

describe('reconciliation confirmed success', () => {
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

  it('confirmed success reconciliation', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k', requestFingerprint: 'fp', executionState: 'RESERVED' });
    await repo.claimExecuting(doc._id);
    await repo.recordOutcome(doc._id, 'UNCERTAIN', 'uncertain', undefined, 'timeout');
    await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'user confirmed applied');
    const after = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after as { reconciliation: { resolution: string } }).reconciliation.resolution).toBe('confirmed_success');
    expect((after as { reconciliation: { resolvedBy: Types.ObjectId } }).reconciliation.resolvedBy.toString()).toBe(userId.toString());
    expect((after as { reconciliation: { evidence: string } }).reconciliation.evidence).toBe('user confirmed applied');
    expect((after as { reconciliation: { resolvedAt: Date } }).reconciliation.resolvedAt).toBeTruthy();
    expect((after as { adapterOutcome: string }).adapterOutcome).toBe('uncertain');
    const events = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events.length).toBe(1);
    // repeated reconciliation rejected
    let threw = false;
    try {
      await reconcileSubmissionAttempt(userId, doc._id.toString(), 'unresolved', 'again');
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
