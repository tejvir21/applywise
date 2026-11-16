/** Atomic daily submission reservation model (Phase 8.1). */

import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReservationStatus = 'RESERVED' | 'FINALIZED' | 'RELEASED';

export interface ISubmissionReservation extends Document {
  userId: Types.ObjectId;
  day: string; // YYYY-MM-DD UTC
  idempotencyKey: string;
  status: ReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const submissionReservationSchema = new Schema<ISubmissionReservation>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    day: { type: String, required: true, trim: true, maxlength: 10 },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, required: true, enum: ['RESERVED', 'FINALIZED', 'RELEASED'], default: 'RESERVED' },
  },
  { timestamps: true },
);

submissionReservationSchema.index({ userId: 1, day: 1, idempotencyKey: 1 }, { unique: true });
submissionReservationSchema.index({ userId: 1, day: 1, status: 1 });

export const SubmissionReservationModel = mongoose.model<ISubmissionReservation>(
  'SubmissionReservation',
  submissionReservationSchema,
);
