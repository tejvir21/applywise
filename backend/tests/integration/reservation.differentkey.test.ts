import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { reserveDailySubmission } from '../../src/services/DailySubmissionReservationService.js';
import { DailySubmissionCounterModel } from '../../src/models/DailySubmissionCounter.js';
import { SubmissionReservationModel } from '../../src/models/SubmissionReservation.js';

describe('reservation different-key concurrency', () => {
  let replSet: MongoMemoryReplSet;
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    await DailySubmissionCounterModel.syncIndexes();
    await SubmissionReservationModel.syncIndexes();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
  beforeEach(async () => {
    await DailySubmissionCounterModel.deleteMany({});
    await SubmissionReservationModel.deleteMany({});
  });

  it('limit 5 with 20 requests', async () => {
    const userId = new Types.ObjectId();
    const limit = 5;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => reserveDailySubmission(userId, limit, `key-${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(5);
    const reservations = await SubmissionReservationModel.countDocuments({ userId });
    expect(reservations).toBe(5);
    const counter = await DailySubmissionCounterModel.findOne({ userId }).lean();
    expect(counter?.count).toBe(5);
  });

  it('limit 1 with 10 requests', async () => {
    const userId = new Types.ObjectId();
    const limit = 1;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => reserveDailySubmission(userId, limit, `key-${i}`)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(1);
    const reservations = await SubmissionReservationModel.countDocuments({ userId });
    expect(reservations).toBe(1);
    const counter = await DailySubmissionCounterModel.findOne({ userId }).lean();
    expect(counter?.count).toBe(1);
  });
});
