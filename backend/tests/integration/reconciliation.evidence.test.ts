import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { reconcileSubmissionAttempt } from '../../src/services/SubmissionReconciliationService.js';
import { ApplicationEventModel } from '../../src/models/Application.js';

describe('reconciliation missing evidence', () => {
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

  it('missing evidence rejected', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k', requestFingerprint: 'fp', executionState: 'RESERVED' });
    await repo.claimExecuting(doc._id);
    await repo.recordOutcome(doc._id, 'UNCERTAIN', 'uncertain', undefined, 'timeout');

    let threw1 = false;
    try { await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', ''); } catch { threw1 = true; }
    expect(threw1).toBe(true);

    let threw2 = false;
    try { await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', '   '); } catch { threw2 = true; }
    expect(threw2).toBe(true);

    const after = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after as { reconciliation: unknown }).reconciliation).toBeFalsy();
    const events = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events.length).toBe(0);

    // valid evidence succeeds
    await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'valid evidence');
    const events2 = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events2.length).toBe(1);
  });
});
