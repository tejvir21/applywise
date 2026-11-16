import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { reserveDailySubmission } from '../../src/services/DailySubmissionReservationService.js';
import { DailySubmissionCounterModel } from '../../src/models/DailySubmissionCounter.js';
import { SubmissionReservationModel } from '../../src/models/SubmissionReservation.js';

describe('reservation same-key concurrency', () => {
  let replSet: MongoMemoryReplSet;
  const userId = new Types.ObjectId();
  const key = 'same-key';
  const limit = 5;
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    await DailySubmissionCounterModel.syncIndexes();
    await SubmissionReservationModel.syncIndexes();
    await DailySubmissionCounterModel.createCollection();
    await SubmissionReservationModel.createCollection();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
  beforeEach(async () => {
    await DailySubmissionCounterModel.deleteMany({});
    await SubmissionReservationModel.deleteMany({});
  });
  it('same key 20 times', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveDailySubmission(userId, limit, key)),
    );
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1);
    const reservations = await SubmissionReservationModel.countDocuments({ userId });
    expect(reservations).toBe(1);
    const counter = await DailySubmissionCounterModel.findOne({ userId }).lean();
    expect(counter?.count).toBe(1);
  });
});
