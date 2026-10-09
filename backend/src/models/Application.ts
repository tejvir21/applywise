/** Job application Mongoose models (Phase 6: management + approval, no submission). */

import mongoose, { Document, Schema, Types } from 'mongoose';

// Application mode: permission-based requires user approval; auto-apply is
// policy-gated and has no submission engine yet (Phase 7+).
export type ApplicationMode = 'auto' | 'permission';

// Explicit application lifecycle. SUBMITTING/SUBMITTED/FAILED/
// NEEDS_MANUAL_ACTION are system-side states: no Phase 6 user endpoint
// transitions into them (see APPLICATION_TRANSITIONS in ApplicationService).
export type ApplicationStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'FAILED'
  | 'NEEDS_MANUAL_ACTION'
  | 'CANCELLED';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED',
  'NEEDS_MANUAL_ACTION',
  'CANCELLED',
];

// A draft answer to an application question. `verified` means the content was
// confirmed against the verified profile or explicitly by the candidate;
// `sensitive` marks consequential declarations (work authorization,
// disability, demographic data) that always need explicit confirmation.
export interface IApplicationAnswer {
  question: string;
  answer: string;
  verified: boolean;
  sensitive: boolean;
}

export interface IApplicationMaterials {
  coverLetter?: string;
  answers: IApplicationAnswer[];
  notes?: string;
}

// Denormalized job snapshot taken at creation so listings stay stable even
// if the job is edited later. Live job data is always read from the job.
export interface IApplicationJobSnapshot {
  title: string;
  companyName: string;
}

export interface IApplication extends Document {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  resumeId?: Types.ObjectId;
  resumeVersion?: number;
  jobSnapshot: IApplicationJobSnapshot;
  // Match snapshot at creation (score + eligibility + explanation summary).
  matchScore?: number;
  matchEligible?: boolean;
  matchExplanation?: Record<string, unknown>;
  mode: ApplicationMode;
  materials: IApplicationMaterials;
  status: ApplicationStatus;
  decidedAt?: Date;
  decisionNote?: string;
  attemptCount: number;
  lastAttemptAt?: Date;
  lastError?: string;
  lastErrorAt?: Date;
  manualActionRequired?: string;
  idempotencyKey?: string;
  unverifiedConfirmedAt?: Date;
  /** Duplicate-protection flag: true once cancelled, freeing the (userId, jobId) slot. */
  isCancelled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApplicationEvent extends Document {
  applicationId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  fromStatus?: ApplicationStatus;
  toStatus?: ApplicationStatus;
  message?: string;
  createdAt: Date;
}

const applicationAnswerSchema = new Schema<IApplicationAnswer>(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer: { type: String, required: true, trim: true, maxlength: 5000 },
    verified: { type: Boolean, default: false },
    sensitive: { type: Boolean, default: false },
  },
  { _id: false },
);

const applicationMaterialsSchema = new Schema<IApplicationMaterials>(
  {
    coverLetter: { type: String, trim: true, maxlength: 20000 },
    answers: { type: [applicationAnswerSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 5000 },
  },
  { _id: false },
);

const applicationJobSnapshotSchema = new Schema<IApplicationJobSnapshot>(
  {
    title: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<IApplication>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    jobId: { type: Schema.Types.ObjectId, required: true, ref: 'Job', index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    resumeVersion: { type: Number, min: 1 },
    jobSnapshot: { type: applicationJobSnapshotSchema, required: true },
    matchScore: { type: Number, min: 0, max: 100 },
    matchEligible: { type: Boolean },
    matchExplanation: { type: Schema.Types.Mixed },
    mode: { type: String, required: true, enum: ['auto', 'permission'], default: 'permission' },
    materials: { type: applicationMaterialsSchema, default: () => ({ answers: [] }) },
    status: {
      type: String,
      required: true,
      enum: APPLICATION_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true, maxlength: 1000 },
    attemptCount: { type: Number, default: 0, min: 0 },
    lastAttemptAt: { type: Date },
    lastError: { type: String, trim: true },
    lastErrorAt: { type: Date },
    manualActionRequired: { type: String, trim: true, maxlength: 2000 },
    idempotencyKey: { type: String, trim: true, maxlength: 100 },
    unverifiedConfirmedAt: { type: Date },
    isCancelled: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Duplicate protection: one live application per candidate+job. Cancelled
// applications set isCancelled, dropping them out of this partial unique
// index so a candidate may re-apply after cancelling. (Equality filters are
// the supported partial-index form; $ne is rejected by the server.)
applicationSchema.index(
  { userId: 1, jobId: 1 },
  { unique: true, partialFilterExpression: { isCancelled: false } },
);
applicationSchema.index({ userId: 1, status: 1, createdAt: -1 });
applicationSchema.index({ userId: 1, createdAt: -1 });
applicationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const applicationEventSchema = new Schema<IApplicationEvent>(
  {
    applicationId: { type: Schema.Types.ObjectId, required: true, ref: 'Application', index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    type: { type: String, required: true, trim: true, maxlength: 50 },
    fromStatus: { type: String, enum: APPLICATION_STATUSES },
    toStatus: { type: String, enum: APPLICATION_STATUSES },
    message: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

applicationEventSchema.index({ applicationId: 1, createdAt: -1 });
applicationEventSchema.index({ userId: 1, createdAt: -1 });

export const ApplicationModel = mongoose.model<IApplication>('Application', applicationSchema);
export const ApplicationEventModel = mongoose.model<IApplicationEvent>('ApplicationEvent', applicationEventSchema);
