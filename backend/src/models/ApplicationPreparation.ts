/** Application preparation Mongoose models (Phase 8.3.13).
 *
 * Application preparation is a candidate-owned, read-only preparation
 * workflow: tailor a resume, write a cover letter, prepare answers to
 * application questions, then review and approve the package before saving
 * it as a draft. Nothing here submits an application — there is no
 * SUBMITTING/SUBMITTED state and no transition to submission.
 *
 * State machine:
 *   DRAFT -> IN_PROGRESS   (first generation/edit)
 *   DRAFT -> CANCELLED
 *   IN_PROGRESS -> DRAFT   (pause/save)
 *   IN_PROGRESS -> READY_FOR_REVIEW  (all components generated)
 *   READY_FOR_REVIEW -> APPROVED     (final approval)
 *   READY_FOR_REVIEW -> REJECTED     (rejection)
 *   READY_FOR_REVIEW -> IN_PROGRESS  (back to editing)
 *   APPROVED -> DRAFT    (reopen for editing)
 *   REJECTED -> DRAFT    (reopen for editing)
 *   CANCELLED -> (terminal)
 *
 * APPROVED requires every generated component (tailored resume, cover
 * letter, each answer) to have reviewStatus === 'APPROVED'.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

export type PreparationStatus = 'DRAFT' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ComponentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type AnswerReviewStatus = 'GENERATED' | 'NEEDS_CANDIDATE_INPUT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export type VerificationStatus = 'VERIFIED' | 'UNSUPPORTED' | 'NEEDS_CANDIDATE_INPUT';

export interface VerificationResult {
  status: VerificationStatus;
  reason?: string;
  matchedFacts?: string[];
  unsupportedClaims?: string[];
}

export interface IPreparationComponent {
  reviewStatus: ComponentReviewStatus;
  reviewedAt?: Date;
  reviewerNote?: string;
  verification?: VerificationResult;
  // Component-level provenance (Phase 8.3.17): tracks the exact source
  // versions used to generate and verify this component.
  provenance?: {
    profileUpdatedAt?: Date;
    resumeId?: Types.ObjectId;
    resumeVersion?: number;
    resumeUpdatedAt?: Date;
    jobId?: Types.ObjectId;
    generatedAt?: Date;
  };
}

export interface IPreparedAnswer {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  verified: boolean;
  sensitive: boolean;
  source?: string; // source description (e.g. 'profile.skills', 'resume.structuredData.experience')
  reviewStatus: AnswerReviewStatus;
  reviewedAt?: Date;
  reviewerNote?: string;
  verification?: VerificationResult;
  // Component-level provenance (Phase 8.3.17): tracks the exact source
  // versions used to generate and verify this answer.
  provenance?: {
    profileUpdatedAt?: Date;
    resumeId?: Types.ObjectId;
    resumeVersion?: number;
    resumeUpdatedAt?: Date;
    jobId?: Types.ObjectId;
    generatedAt?: Date;
  };
}

export interface IApplicationPreparation extends Document {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  jobSnapshot: { title: string; companyName: string };
  resumeId?: Types.ObjectId; // original resume reference (never modified)
  resumeVersion?: number;
  status: PreparationStatus;
  missingInformation: string[]; // fields the candidate still needs to provide
  // Optional note captured when the preparation was rejected
  rejectionNote?: string;
  // Tailored resume (generated, candidate-reviewed)
  tailoredResume?: {
    summary: string;
    highlights: string[];
    skillsUsed: string[];
    flaggedGaps: string[];
    generatedAt: Date;
  } & IPreparationComponent;
  // Cover letter (generated, candidate-reviewed)
  coverLetter?: {
    body: string;
    flaggedGaps: string[];
    generatedAt: Date;
  } & IPreparationComponent;
  // Application question answers (generated, candidate-reviewed)
  answers: IPreparedAnswer[];
  // Generation metadata
  materialsProvenance?: {
    provider: string;
    model: string;
    generatedAt: Date;
    profileUpdatedAt?: Date;
    resumeId?: Types.ObjectId;
    resumeVersion?: number;
    resumeUpdatedAt?: Date;
    jobId?: Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

const provenanceSchema = {
  profileUpdatedAt: { type: Date },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
  resumeVersion: { type: Number, min: 1 },
  resumeUpdatedAt: { type: Date },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
  generatedAt: { type: Date },
};

const preparationComponentSchema = new Schema<IPreparationComponent>({
  reviewStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedAt: { type: Date },
  reviewerNote: { type: String, trim: true, maxlength: 1000 },
  verification: {
    status: { type: String, enum: ['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT'] },
    reason: { type: String, trim: true, maxlength: 500 },
    matchedFacts: [{ type: String, trim: true, maxlength: 200 }],
    unsupportedClaims: [{ type: String, trim: true, maxlength: 500 }],
  },
  provenance: provenanceSchema,
}, { _id: false });

const preparedAnswerSchema = new Schema<IPreparedAnswer>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  question: { type: String, required: true, trim: true, maxlength: 500 },
  answer: { type: String, required: true, trim: true, maxlength: 5000 },
  verified: { type: Boolean, default: false },
  sensitive: { type: Boolean, default: false },
  source: { type: String, trim: true, maxlength: 200 },
  reviewStatus: {
    type: String,
    enum: ['GENERATED', 'NEEDS_CANDIDATE_INPUT', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED'],
    default: 'GENERATED',
  },
  reviewedAt: { type: Date },
  reviewerNote: { type: String, trim: true, maxlength: 1000 },
  verification: {
    status: { type: String, enum: ['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT'] },
    reason: { type: String, trim: true, maxlength: 500 },
    matchedFacts: [{ type: String, trim: true, maxlength: 200 }],
    unsupportedClaims: [{ type: String, trim: true, maxlength: 500 }],
  },
  provenance: provenanceSchema,
}, { _id: false, id: false });

const tailoredResumeSchema = new Schema({
  summary: { type: String, trim: true, maxlength: 5000 },
  highlights: [{ type: String, trim: true, maxlength: 1000 }],
  skillsUsed: [{ type: String, trim: true, maxlength: 100 }],
  flaggedGaps: [{ type: String, trim: true, maxlength: 1000 }],
  generatedAt: { type: Date },
  reviewStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedAt: { type: Date },
  reviewerNote: { type: String, trim: true, maxlength: 1000 },
  verification: {
    status: { type: String, enum: ['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT'] },
    reason: { type: String, trim: true, maxlength: 500 },
    matchedFacts: [{ type: String, trim: true, maxlength: 200 }],
    unsupportedClaims: [{ type: String, trim: true, maxlength: 500 }],
  },
  provenance: provenanceSchema,
}, { _id: false });

const coverLetterSchema = new Schema({
  body: { type: String, trim: true, maxlength: 20000 },
  flaggedGaps: [{ type: String, trim: true, maxlength: 1000 }],
  generatedAt: { type: Date },
  reviewStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedAt: { type: Date },
  reviewerNote: { type: String, trim: true, maxlength: 1000 },
  verification: {
    status: { type: String, enum: ['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT'] },
    reason: { type: String, trim: true, maxlength: 500 },
    matchedFacts: [{ type: String, trim: true, maxlength: 200 }],
    unsupportedClaims: [{ type: String, trim: true, maxlength: 500 }],
  },
  provenance: provenanceSchema,
}, { _id: false });

const applicationPreparationSchema = new Schema<IApplicationPreparation>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    jobId: { type: Schema.Types.ObjectId, required: true, ref: 'Job', index: true },
    jobSnapshot: {
      title: { type: String, required: true, trim: true },
      companyName: { type: String, required: true, trim: true },
    },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    resumeVersion: { type: Number, min: 1 },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    missingInformation: [{ type: String, trim: true, maxlength: 200 }],
    tailoredResume: { type: tailoredResumeSchema },
    coverLetter: { type: coverLetterSchema },
    answers: { type: [preparedAnswerSchema], default: [] },
    materialsProvenance: {
      provider: { type: String, trim: true, maxlength: 50 },
      model: { type: String, trim: true, maxlength: 100 },
      generatedAt: { type: Date },
      profileUpdatedAt: { type: Date },
      resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
      resumeVersion: { type: Number, min: 1 },
      resumeUpdatedAt: { type: Date },
      jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    },
  },
  { timestamps: true },
);

// One active (non-cancelled) preparation per candidate+job
applicationPreparationSchema.index(
  { userId: 1, jobId: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'CANCELLED' } } },
);
applicationPreparationSchema.index({ userId: 1, status: 1, createdAt: -1 });
applicationPreparationSchema.index({ userId: 1, createdAt: -1 });

export const ApplicationPreparationModel = mongoose.model<IApplicationPreparation>(
  'ApplicationPreparation',
  applicationPreparationSchema,
);

export const PREPARATION_TRANSITIONS: Record<PreparationStatus, PreparationStatus[]> = {
  DRAFT: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DRAFT', 'READY_FOR_REVIEW', 'CANCELLED'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED', 'IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['DRAFT', 'CANCELLED'],
  REJECTED: ['DRAFT', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransition(from: PreparationStatus, to: PreparationStatus): boolean {
  const allowed = PREPARATION_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

export function allComponentsApproved(prep: IApplicationPreparation): boolean {
  // Every generated component must be APPROVED for the package to be APPROVED.
  const components: ComponentReviewStatus[] = [];
  if (prep.tailoredResume) components.push(prep.tailoredResume.reviewStatus);
  if (prep.coverLetter) components.push(prep.coverLetter.reviewStatus);
  for (const a of prep.answers) {
    if (a.reviewStatus === 'APPROVED') components.push('APPROVED');
    else if (a.reviewStatus === 'REJECTED') components.push('REJECTED');
    else components.push('PENDING'); // GENERATED, NEEDS_CANDIDATE_INPUT, NEEDS_REVIEW
  }
  if (components.length === 0) return false; // nothing generated, nothing to approve
  return components.every((s) => s === 'APPROVED');
}
