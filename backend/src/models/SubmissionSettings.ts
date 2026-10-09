/** Submission settings model (Phase 8): user-owned Auto-Apply configuration. */

import mongoose, { Document, Schema, Types } from 'mongoose';

export type PlatformSubmissionMode = 'auto' | 'permission' | 'disabled';

export interface IPlatformSetting {
  platform: string;
  mode: PlatformSubmissionMode;
  /** Whether the user completed that platform's authorization (e.g. OAuth). */
  authorized: boolean;
}

export interface ISubmissionSettings extends Document {
  userId: Types.ObjectId;
  /** Global kill-switch: pause all new automated submissions. */
  globalPaused: boolean;
  /** Maximum submission attempts per day (counts attempts, incl. retries). */
  dailyLimit: number;
  /** Minimum match score for automatic submission. */
  minMatchScore: number;
  platforms: IPlatformSetting[];
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    platform: { type: String, required: true, trim: true, maxlength: 50 },
    mode: { type: String, required: true, enum: ['auto', 'permission', 'disabled'], default: 'permission' },
    authorized: { type: Boolean, default: false },
  },
  { _id: false },
);

const submissionSettingsSchema = new Schema<ISubmissionSettings>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', unique: true, index: true },
    globalPaused: { type: Boolean, default: false },
    dailyLimit: { type: Number, default: 10, min: 1, max: 100 },
    minMatchScore: { type: Number, default: 80, min: 0, max: 100 },
    platforms: { type: [platformSettingSchema], default: [] },
  },
  { timestamps: true },
);

export const SubmissionSettingsModel = mongoose.model<ISubmissionSettings>(
  'SubmissionSettings',
  submissionSettingsSchema,
);
