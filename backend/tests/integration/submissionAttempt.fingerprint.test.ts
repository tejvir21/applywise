import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { SubmissionAttemptRepository } from '../../src/repositories/SubmissionAttemptRepository.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { computeRequestFingerprint } from '../../src/models/SubmissionAttempt.js';

describe('submission attempt fingerprint mismatch', () => {
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

  it('fingerprint mismatch rejected', async () => {
    const userId = new Types.ObjectId();
    const applicationId = new Types.ObjectId();
    const platform = 'naukri';
    const key = 'key-1';
    const fpA = computeRequestFingerprint({ applicationId: applicationId.toString(), platform, materialsHash: 'hashA', resumeVersion: 1 });
    const fpB = computeRequestFingerprint({ applicationId: applicationId.toString(), platform, materialsHash: 'hashB', resumeVersion: 1 });
    const first = await repo.createOrGet(userId, applicationId, platform, key, fpA, {});
    let threw = false;
    try {
      await repo.createOrGet(userId, applicationId, platform, key, fpB, {});
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain('Fingerprint mismatch');
    }
    expect(threw).toBe(true);
    const count = await SubmissionAttemptModel.countDocuments({ userId, applicationId, idempotencyKey: key });
    expect(count).toBe(1);
    const doc = await SubmissionAttemptModel.findOne({ userId, applicationId, idempotencyKey: key }).lean();
    expect((doc as { _id: { toString: () => string } })._id.toString()).toBe(first.attempt._id.toString());
    expect((doc as { requestFingerprint: string }).requestFingerprint).toBe(fpA);
    expect((doc as { platform: string }).platform).toBe('naukri');
    expect((doc as { executionState: string }).executionState).toBe('REQUESTED');

    // different key with fpB creates separate attempt
    const second = await repo.createOrGet(userId, applicationId, platform, 'key-2', fpB, {});
    expect(second.created).toBe(true);
    const total = await SubmissionAttemptModel.countDocuments({ userId, applicationId });
    expect(total).toBe(2);
  });
});
