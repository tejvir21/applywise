import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { computeRequestFingerprint } from '../../src/models/SubmissionAttempt.js';

describe('submission attempt createOrGet concurrency', () => {
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

  it('20 concurrent createOrGet same key', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const platform = 'linkedin';
    const key = 'idempotency-1';
    const fingerprint = computeRequestFingerprint({ applicationId: applicationId.toString(), platform, materialsHash: 'hash123', resumeVersion: 1 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => repo.createOrGet(userId, applicationId, platform, key, fingerprint, {})),
    );
    const ids = new Set(results.map((r) => r.attempt._id.toString()));
    expect(ids.size).toBe(1);
    const count = await SubmissionAttemptModel.countDocuments({ userId, applicationId, idempotencyKey: key });
    expect(count).toBe(1);
    const doc = await SubmissionAttemptModel.findOne({ userId, applicationId, idempotencyKey: key }).lean();
    expect((doc as { requestFingerprint: string }).requestFingerprint).toBe(fingerprint);
    expect((doc as { executionState: string }).executionState).toBe('REQUESTED');
  });
});
