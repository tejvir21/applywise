import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { reconcileSubmissionAttempt } from '../../src/services/SubmissionReconciliationService.js';
import { ApplicationEventModel } from '../../src/models/Application.js';

describe('reconciliation invalid source state', () => {
  let replSet: MongoMemoryReplSet;
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

  it('invalid states rejected', async () => {
    const states = ['REQUESTED','VALIDATING','RESERVED','EXECUTING','SUCCEEDED','FAILED'] as const;
    for (const s of states) {
      const userId = new Types.ObjectId();
      const applicationId = new Types.ObjectId();
      const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: `k-${s}`, requestFingerprint: 'fp', executionState: s });
      let threw = false;
      try {
        await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'evidence');
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      const after = await SubmissionAttemptModel.findById(doc._id).lean();
      expect((after as { executionState: string }).executionState).toBe(s);
      expect((after as { reconciliation: unknown }).reconciliation).toBeFalsy();
    }
    const events = await ApplicationEventModel.find({}).lean();
    expect(events.length).toBe(0);

    // UNCERTAIN remains reconcilable
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k-unc', requestFingerprint: 'fp', executionState: 'UNCERTAIN' });
    await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'evidence');
    const after = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after as { reconciliation: { resolution: string } }).reconciliation.resolution).toBe('confirmed_success');
  });
});
