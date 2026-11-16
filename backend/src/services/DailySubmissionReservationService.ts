import { Types } from 'mongoose';
import { DailySubmissionCounterModel } from '../models/DailySubmissionCounter.js';
import { SubmissionReservationModel, ReservationStatus } from '../models/SubmissionReservation.js';
import { ValidationError } from '../utils/errors.js';

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface ReservationResult {
  id: string;
  userId: string;
  day: string;
  idempotencyKey: string;
  status: ReservationStatus;
  created: boolean;
}

export type FinalizeResult = 'finalized' | 'already_finalized' | 'released' | 'not_found';
export type ReleaseResult = 'released' | 'already_released' | 'finalized' | 'not_found';

export async function reserveDailySubmission(
  userId: Types.ObjectId,
  dailyLimit: number,
  idempotencyKey: string,
): Promise<ReservationResult> {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) throw new ValidationError('dailyLimit must be a positive integer', { dailyLimit });
  if (!idempotencyKey || !idempotencyKey.trim()) throw new ValidationError('idempotencyKey is required', { idempotencyKey });

  const day = utcDay();

  const existing = await SubmissionReservationModel.findOne({ userId, day, idempotencyKey }).lean().exec();
  if (existing) {
    return {
      id: (existing as { _id: Types.ObjectId })._id.toString(),
      userId: userId.toString(),
      day,
      idempotencyKey,
      status: (existing as { status: ReservationStatus }).status,
      created: false,
    };
  }

  try {
    await DailySubmissionCounterModel.create({ userId, day, count: 0 });
  } catch (err) {
    if ((err as { code?: number })?.code !== 11000) throw err;
  }

  const counter = await DailySubmissionCounterModel.findOneAndUpdate(
    { userId, day, count: { $lt: dailyLimit } },
    { $inc: { count: 1 } },
    { new: true },
  ).exec();

  if (!counter) {
    const raced = await SubmissionReservationModel.findOne({ userId, day, idempotencyKey }).lean().exec();
    if (raced) {
      return {
        id: (raced as { _id: Types.ObjectId })._id.toString(),
        userId: userId.toString(),
        day,
        idempotencyKey,
        status: (raced as { status: ReservationStatus }).status,
        created: false,
      };
    }
    throw new ValidationError('Daily submission limit reached', { dailyLimit });
  }

  try {
    const created = await SubmissionReservationModel.create({ userId, day, idempotencyKey, status: 'RESERVED' });
    return { id: created._id.toString(), userId: userId.toString(), day, idempotencyKey, status: 'RESERVED', created: true };
  } catch (err) {
    const isDuplicateKey = (err as { code?: number })?.code === 11000;
    let rollbackError: unknown;

    // Roll back the counter exactly once. A rollback failure is captured but
    // never replaces the original creation error.
    if (isDuplicateKey) {
      try {
        await DailySubmissionCounterModel.updateOne({ userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } }).exec();
      } catch (rollbackErr) {
        rollbackError = rollbackErr;
      }
      const raced = await SubmissionReservationModel.findOne({ userId, day, idempotencyKey }).lean().exec();
      if (raced) {
        return {
          id: (raced as { _id: Types.ObjectId })._id.toString(),
          userId: userId.toString(),
          day,
          idempotencyKey,
          status: (raced as { status: ReservationStatus }).status,
          created: false,
        };
      }
    } else {
      try {
        await DailySubmissionCounterModel.updateOne({ userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } }).exec();
      } catch (rollbackErr) {
        rollbackError = rollbackErr;
      }
    }

    // Surface the rollback failure without swallowing or replacing the
    // original creation error. The rollback error is attached to the thrown
    // error so it remains observable to callers and logs.
    if (rollbackError !== undefined) {
      (err as { rollbackError?: unknown }).rollbackError = rollbackError;
    }
    throw err;
  }
}

export async function finalizeDailySubmission(reservationId: string): Promise<FinalizeResult> {
  const res = await SubmissionReservationModel.findOneAndUpdate(
    { _id: reservationId, status: 'RESERVED' },
    { $set: { status: 'FINALIZED' } },
    { new: true },
  ).exec();
  if (res) return 'finalized';
  const existing = await SubmissionReservationModel.findById(reservationId).lean().exec();
  if (!existing) return 'not_found';
  return (existing as { status: string }).status === 'FINALIZED' ? 'already_finalized' : 'released';
}

export async function releaseDailySubmission(reservationId: string): Promise<ReleaseResult> {
  const res = await SubmissionReservationModel.findOneAndUpdate(
    { _id: reservationId, status: 'RESERVED' },
    { $set: { status: 'RELEASED' } },
    { new: true },
  ).exec();
  if (res) {
    await DailySubmissionCounterModel.updateOne({ userId: res.userId, day: res.day, count: { $gt: 0 } }, { $inc: { count: -1 } }).exec();
    return 'released';
  }
  const existing = await SubmissionReservationModel.findById(reservationId).lean().exec();
  if (!existing) return 'not_found';
  return (existing as { status: string }).status === 'RELEASED' ? 'already_released' : 'finalized';
}
