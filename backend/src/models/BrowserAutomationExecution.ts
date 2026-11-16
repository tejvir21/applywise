/**
 * Browser Automation Execution model (Phase 9.1).
 *
 * Persistent, owner-scoped execution records for browser-based form
 * inspection and filling. Does NOT submit applications.
 */

import mongoose, { Document, Schema, Types } from 'mongoose';

export type AutomationExecutionState =
  | 'CREATED'
  | 'INSPECTING'
  | 'FORM_DETECTED'
  | 'AWAITING_CANDIDATE_INPUT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED_FOR_EXECUTION'
  | 'FILLING'
  | 'FILLED'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_MANUAL_ACTION';

export interface IAutomationFieldMapping {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  value: string | null;
  source: string | null;
  verified: boolean;
  result: 'MAPPED' | 'UNMAPPED' | 'NEEDS_CANDIDATE_INPUT' | 'UNSUPPORTED';
  reason?: string;
}

export interface IAutomationFillResult {
  fieldId: string;
  fieldLabel: string;
  status: 'FILLED' | 'SKIPPED' | 'NEEDS_CANDIDATE_INPUT' | 'FAILED' | 'UNSUPPORTED';
  value?: string;
  error?: string;
  verified: boolean;
}

export interface IAutomationExecution extends Document {
  userId: Types.ObjectId;
  jobId?: Types.ObjectId;
  preparationId?: Types.ObjectId;
  platform?: string;
  applicationUrl: string;
  state: AutomationExecutionState;
  detectedFields?: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
    confidence: number;
  }>;
  fieldMappings?: IAutomationFieldMapping[];
  filledFields?: IAutomationFillResult[];
  skippedFields?: IAutomationFillResult[];
  failedFields?: IAutomationFillResult[];
  candidateInputRequired?: IAutomationFieldMapping[];
  selectedResumeId?: Types.ObjectId;
  approvedForExecution: boolean;
  approvalVersion?: number;
  // Fingerprint of the execution data at approval time (Phase 9.1.4).
  // Used to detect stale approvals when answers, resume, or job data change.
  approvalFingerprint?: string;
  pauseReason?: string;
  errorDetails?: string;
  evidenceRefs?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const automationFieldMappingSchema = new Schema<IAutomationFieldMapping>({
  fieldId: { type: String, required: true },
  fieldLabel: { type: String, required: true },
  fieldType: { type: String, required: true },
  value: { type: String, default: null },
  source: { type: String, default: null },
  verified: { type: Boolean, default: false },
  result: { type: String, enum: ['MAPPED', 'UNMAPPED', 'NEEDS_CANDIDATE_INPUT', 'UNSUPPORTED'], required: true },
  reason: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const automationFillResultSchema = new Schema<IAutomationFillResult>({
  fieldId: { type: String, required: true },
  fieldLabel: { type: String, required: true },
  status: { type: String, enum: ['FILLED', 'SKIPPED', 'NEEDS_CANDIDATE_INPUT', 'FAILED', 'UNSUPPORTED'], required: true },
  value: { type: String },
  error: { type: String, trim: true, maxlength: 500 },
  verified: { type: Boolean, default: false },
}, { _id: false });

const automationExecutionSchema = new Schema<IAutomationExecution>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', index: true },
    preparationId: { type: Schema.Types.ObjectId, ref: 'ApplicationPreparation', index: true },
    platform: { type: String, trim: true, maxlength: 50 },
    applicationUrl: { type: String, required: true, trim: true, maxlength: 2000 },
    state: {
      type: String,
      required: true,
      enum: ['CREATED', 'INSPECTING', 'FORM_DETECTED', 'AWAITING_CANDIDATE_INPUT', 'READY_FOR_REVIEW', 'APPROVED_FOR_EXECUTION', 'FILLING', 'FILLED', 'PAUSED', 'FAILED', 'CANCELLED', 'REQUIRES_MANUAL_ACTION'],
      default: 'CREATED',
      index: true,
    },
    detectedFields: [{
      id: { type: String, required: true },
      label: { type: String, required: true },
      type: { type: String, required: true },
      required: { type: Boolean, default: false },
      options: [{ type: String }],
      confidence: { type: Number, min: 0, max: 1 },
    }],
    fieldMappings: [automationFieldMappingSchema],
    filledFields: [automationFillResultSchema],
    skippedFields: [automationFillResultSchema],
    failedFields: [automationFillResultSchema],
    candidateInputRequired: [automationFieldMappingSchema],
    selectedResumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
    approvedForExecution: { type: Boolean, default: false },
    approvalVersion: { type: Number, min: 1 },
    pauseReason: { type: String, trim: true, maxlength: 500 },
    errorDetails: { type: String, trim: true, maxlength: 2000 },
    evidenceRefs: [{ type: String, trim: true, maxlength: 200 }],
  },
  { timestamps: true },
);

automationExecutionSchema.index({ userId: 1, state: 1, createdAt: -1 });
automationExecutionSchema.index({ userId: 1, createdAt: -1 });

export const BrowserAutomationExecutionModel = mongoose.model<IAutomationExecution>(
  'BrowserAutomationExecution',
  automationExecutionSchema,
);