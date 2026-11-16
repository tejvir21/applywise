import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { reconcileSubmissionAttempt } from '../../src/services/SubmissionReconciliationService.js';
import { ApplicationEventModel } from '../../src/models/Application.js';

describe('reconciliation audit atomicity', () => {
  let replSet: MongoMemoryReplSet;
  const repo = new SubmissionAttemptRepository();
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    await SubmissionAttemptModel.syncIndexes();
    await ApplicationEventModel.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
  beforeEach(async () => {
    await SubmissionAttemptModel.deleteMany({});
    await ApplicationEventModel.deleteMany({});
  });

  it('audit failure rolls back', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const doc = await SubmissionAttemptModel.create({ userId, applicationId, platform: 'linkedin', idempotencyKey: 'k', requestFingerprint: 'fp', executionState: 'RESERVED' });
    await repo.claimExecuting(doc._id);
    await repo.recordOutcome(doc._id, 'UNCERTAIN', 'uncertain', undefined, 'timeout');

    // create conflicting audit record
    await ApplicationEventModel.create({ applicationId, userId, type: 'submission_reconciled', message: 'conflict' });

    // create temp unique index
    const coll = ApplicationEventModel.collection;
    await coll.createIndex({ applicationId: 1, userId: 1, type: 1 }, { unique: true, name: 'tmp_audit_unique' });

    let threw = false;
    try {
      await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'evidence');
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);

    const after = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after as { executionState: string }).executionState).toBe('UNCERTAIN');
    expect((after as { reconciliation: unknown }).reconciliation).toBeFalsy();

    const events = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events.length).toBe(1); // only conflicting

    // cleanup index and conflicting record
    await coll.dropIndex('tmp_audit_unique');
    await ApplicationEventModel.deleteMany({ applicationId });

    // retry
    await reconcileSubmissionAttempt(userId, doc._id.toString(), 'confirmed_success', 'evidence');
    const events2 = await ApplicationEventModel.find({ applicationId }).lean();
    expect(events2.length).toBe(1);
    const after2 = await SubmissionAttemptModel.findById(doc._id).lean();
    expect((after2 as { reconciliation: { resolution: string } }).reconciliation.resolution).toBe('confirmed_success');
  });
});
