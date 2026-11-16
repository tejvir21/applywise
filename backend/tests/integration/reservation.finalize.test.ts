import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { reserveDailySubmission, finalizeDailySubmission, releaseDailySubmission } from '../../src/services/DailySubmissionReservationService.js';
import { DailySubmissionCounterModel } from '../../src/models/DailySubmissionCounter.js';
import { SubmissionReservationModel } from '../../src/models/SubmissionReservation.js';

describe('reservation finalize/release concurrency', () => {
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

  it('finalization idempotency', async () => {
    const userId = new Types.ObjectId();
    const r = await reserveDailySubmission(userId, 5, 'k');
    const before = await DailySubmissionCounterModel.findOne({ userId }).lean();
    const results = await Promise.all(Array.from({ length: 10 }, () => finalizeDailySubmission(r.id)));
    const finalized = results.filter((x) => x === 'finalized');
    expect(finalized.length).toBe(1);
    const doc = await SubmissionReservationModel.findById(r.id).lean();
    expect((doc as { status: string }).status).toBe('FINALIZED');
    const after = await DailySubmissionCounterModel.findOne({ userId }).lean();
    expect(after?.count).toBe(before?.count);
  });

  it('release idempotency', async () => {
    const userId = new Types.ObjectId();
    const r = await reserveDailySubmission(userId, 5, 'k');
    const results = await Promise.all(Array.from({ length: 10 }, () => releaseDailySubmission(r.id)));
    const released = results.filter((x) => x === 'released');
    expect(released.length).toBe(1);
    const doc = await SubmissionReservationModel.findById(r.id).lean();
    expect((doc as { status: string }).status).toBe('RELEASED');
    const counter = await DailySubmissionCounterModel.findOne({ userId }).lean();
    expect(counter?.count).toBe(0);
  });

  it('finalize/release race', async () => {
    const userId = new Types.ObjectId();
    const r = await reserveDailySubmission(userId, 5, 'k');
    const [a, b] = await Promise.all([
      finalizeDailySubmission(r.id),
      releaseDailySubmission(r.id),
    ]);
    const doc = await SubmissionReservationModel.findById(r.id).lean();
    const status = (doc as { status: string }).status;
    expect(['FINALIZED', 'RELEASED']).toContain(status);
    const counter = await DailySubmissionCounterModel.findOne({ userId }).lean();
    if (status === 'FINALIZED') expect(counter?.count).toBe(1);
    else expect(counter?.count).toBe(0);
  });
});
