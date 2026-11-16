/** Atomic daily submission attempt counter (Phase 8.1). */

import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDailySubmissionCounter extends Document {
  userId: Types.ObjectId;
  day: string; // YYYY-MM-DD (UTC)
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const dailySubmissionCounterSchema = new Schema<IDailySubmissionCounter>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    day: { type: String, required: true, trim: true, maxlength: 10 },
    count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

dailySubmissionCounterSchema.index({ userId: 1, day: 1 }, { unique: true });

export const DailySubmissionCounterModel = mongoose.model<IDailySubmissionCounter>(
  'DailySubmissionCounter',
  dailySubmissionCounterSchema,
);
