/** Focused reservation rollback tests:
 *
 * 1. Non-duplicate reservation creation failure after counter increment.
 * 2. Successful rollback after that failure.
 * 3. Rollback itself failing (original error preserved, rollback error surfaced).
 * 4. Duplicate-key recovery.
 * 5. Repeated release not decrementing twice.
 * 6. Finalization not decrementing the counter.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import {
  reserveDailySubmission,
  finalizeDailySubmission,
  releaseDailySubmission,
} from '../../src/services/DailySubmissionReservationService.js';
import { DailySubmissionCounterModel } from '../../src/models/DailySubmissionCounter.js';
import { SubmissionReservationModel } from '../../src/models/SubmissionReservation.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('reservation rollback on creation failure', () => {
  let mongo: MongoMemoryServer;
  const userId = new Types.ObjectId();

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    await DailySubmissionCounterModel.syncIndexes();
    await SubmissionReservationModel.syncIndexes();
    await DailySubmissionCounterModel.createCollection();
    await SubmissionReservationModel.createCollection();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await DailySubmissionCounterModel.deleteMany({});
    await SubmissionReservationModel.deleteMany({});
    vi.restoreAllMocks();
  });

  async function seedCounter(count: number, day = today()) {
    await DailySubmissionCounterModel.create({ userId, day, count });
  }

  it('1. non-duplicate creation failure after counter increment throws and rolls back', async () => {
    await seedCounter(0);
    const createSpy = vi
      .spyOn(SubmissionReservationModel, 'create')
      .mockRejectedValueOnce(new Error('non-duplicate creation failure'));

    await expect(reserveDailySubmission(userId, 5, 'key-1')).rejects.toThrow(
      'non-duplicate creation failure',
    );

    // No reservation persisted for the failed key.
    const reservation = await SubmissionReservationModel.findOne({
      userId,
      day: today(),
      idempotencyKey: 'key-1',
    }).lean().exec();
    expect(reservation).toBeNull();

    createSpy.mockRestore();
  });

  it('2. successful rollback returns counter to its pre-increment value', async () => {
    await seedCounter(0);
    const createSpy = vi
      .spyOn(SubmissionReservationModel, 'create')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(reserveDailySubmission(userId, 5, 'key-2')).rejects.toThrow('boom');

    const counter = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(counter?.count).toBe(0);

    createSpy.mockRestore();
  });

  it('3. rollback failure is observable; original creation error is preserved', async () => {
    await seedCounter(0);
    const createSpy = vi
      .spyOn(SubmissionReservationModel, 'create')
      .mockRejectedValueOnce(new Error('creation failed'));
    const updateSpy = vi
      .spyOn(DailySubmissionCounterModel, 'updateOne')
      .mockRejectedValueOnce(new Error('rollback failed'));

    const err = await reserveDailySubmission(userId, 5, 'key-3').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('creation failed'); // original error preserved
    expect((err as { rollbackError?: unknown }).rollbackError).toBeDefined(); // rollback failure surfaced
    expect(updateSpy).toHaveBeenCalled();

    createSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('4. duplicate-key recovery returns existing reservation without double-counting', async () => {
    await seedCounter(0);
    const first = await reserveDailySubmission(userId, 5, 'key-4');
    expect(first.created).toBe(true);

    const counterAfterFirst = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(counterAfterFirst?.count).toBe(1);

    const second = await reserveDailySubmission(userId, 5, 'key-4');
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);

    const counterAfterSecond = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(counterAfterSecond?.count).toBe(1); // not incremented again
  });

  it('5. repeated release does not decrement the counter twice', async () => {
    await seedCounter(0);
    const r = await reserveDailySubmission(userId, 5, 'key-5');
    expect(r.created).toBe(true);

    const before = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(before?.count).toBe(1);

    const first = await releaseDailySubmission(r.id);
    expect(first).toBe('released');

    const afterFirst = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(afterFirst?.count).toBe(0);

    const second = await releaseDailySubmission(r.id);
    expect(second).toBe('already_released');

    const afterSecond = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(afterSecond?.count).toBe(0); // not decremented twice
  });

  it('6. finalization does not decrement the counter', async () => {
    await seedCounter(0);
    const r = await reserveDailySubmission(userId, 5, 'key-6');
    expect(r.created).toBe(true);

    const before = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(before?.count).toBe(1);

    const result = await finalizeDailySubmission(r.id);
    expect(result).toBe('finalized');

    const after = await DailySubmissionCounterModel.findOne({ userId, day: today() }).lean().exec();
    expect(after?.count).toBe(1); // counter unchanged by finalization
  });
});
