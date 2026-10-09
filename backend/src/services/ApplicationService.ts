/**
 * Application management service (Phase 6: records, review, approval).
 *
 * ---- State machine ----
 * DRAFT -> READY_FOR_REVIEW   (request-review, mode 'auto')
 * DRAFT -> AWAITING_APPROVAL  (request-review, mode 'permission')
 * READY_FOR_REVIEW -> AWAITING_APPROVAL | APPROVED | DRAFT | CANCELLED
 * AWAITING_APPROVAL -> APPROVED | DRAFT | CANCELLED
 * APPROVED -> SUBMITTING | NEEDS_MANUAL_ACTION | CANCELLED
 * SUBMITTING -> SUBMITTED | FAILED | NEEDS_MANUAL_ACTION | CANCELLED
 * FAILED | NEEDS_MANUAL_ACTION -> CANCELLED
 * SUBMITTED | CANCELLED -> (terminal)
 *
 * NEEDS_MANUAL_ACTION is the safe-handoff state: an approved application
 * whose platform has no authorized automatic path moves here (system actor)
 * with completion instructions, and waits for the candidate to act on the
 * platform's own pages.
 *
 * SUBMITTING / SUBMITTED / FAILED / NEEDS_MANUAL_ACTION are system-actor
 * states: no Phase 6 user endpoint transitions into them, and user-actor
 * transitions targeting them are rejected. An application is therefore never
 * marked submitted by preparation, approval, or UI interaction — only a
 * future submission engine (Phase 7+) acting as 'system' with reliable
 * confirmation may do so.
 *
 * ---- Safety rules ----
 * - Identity always comes from authentication; client-supplied user IDs are
 *   never trusted (all repository access is owner-scoped).
 * - Draft materials are editable in DRAFT only; anything else is rejected.
 * - Requesting review or approving with unverified (or sensitive unverified)
 *   answers requires explicit `confirmUnverified`; confirmations are audited.
 * - One live application per candidate+job (partial unique index excluding
 *   CANCELLED), plus optional client idempotency keys; duplicate-key races
 *   resolve to 409 with the existing application id.
 */

import { Types } from 'mongoose';
import {
  ApplicationStatus,
} from '../models/Application.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { CandidateProfileRepository } from '../repositories/CandidateProfileRepository.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { computeJobMatch, type MatchableJob, type MatchableProfile } from './JobMatchingService.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

const jobRepository = new JobRepository();
const resumeRepository = new ResumeRepository();
const candidateProfileRepository = new CandidateProfileRepository();
const applicationRepository = new ApplicationRepository();

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ['READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'CANCELLED'],
  READY_FOR_REVIEW: ['AWAITING_APPROVAL', 'APPROVED', 'DRAFT', 'CANCELLED'],
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SUBMITTING', 'NEEDS_MANUAL_ACTION', 'CANCELLED'],
  SUBMITTING: ['SUBMITTED', 'FAILED', 'NEEDS_MANUAL_ACTION', 'CANCELLED'],
  SUBMITTED: [],
  FAILED: ['CANCELLED'],
  NEEDS_MANUAL_ACTION: ['CANCELLED'],
  CANCELLED: [],
};

const SYSTEM_ONLY_TARGETS: ApplicationStatus[] = ['SUBMITTING', 'SUBMITTED', 'FAILED', 'NEEDS_MANUAL_ACTION'];

const CANCELLABLE_FROM: ApplicationStatus[] = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'FAILED',
  'NEEDS_MANUAL_ACTION',
];

export type TransitionActor = 'user' | 'system';

/** Throw a ValidationError unless `to` is a permitted, actor-allowed target. */
export function assertTransitionAllowed(from: ApplicationStatus, to: ApplicationStatus, actor: TransitionActor = 'user'): void {
  const allowed = APPLICATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Cannot transition application from ${from} to ${to}`, {
      from,
      to,
      allowed,
    });
  }
  if (actor === 'user' && SYSTEM_ONLY_TARGETS.includes(to)) {
    throw new ValidationError(`Transition to ${to} is reserved for the submission engine`, { from, to });
  }
}

export interface ApplicationDetail {
  id: string;
  jobId: string;
  jobSnapshot: { title: string; companyName: string };
  resumeId?: string;
  resumeVersion?: number;
  matchScore?: number;
  matchEligible?: boolean;
  matchExplanation?: Record<string, unknown>;
  mode: 'auto' | 'permission';
  materials: {
    coverLetter?: string;
    answers: Array<{ question: string; answer: string; verified: boolean; sensitive: boolean }>;
    notes?: string;
    tailoredResume?: {
      summary: string;
      highlights: string[];
      skillsUsed: string[];
      flaggedGaps: string[];
      generatedAt: Date;
    };
  };
  status: ApplicationStatus;
  decidedAt?: Date;
  decisionNote?: string;
  attemptCount: number;
  lastError?: string;
  manualActionRequired?: string;
  unverifiedConfirmedAt?: Date;
  isCancelled: boolean;
  materialsReviewedAt?: Date;
  materialsProvenance?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function parseObjectId(value: string, label: string): Types.ObjectId {
  try {
    return new Types.ObjectId(value);
  } catch {
    throw new ValidationError(`Invalid ${label}`, { [label]: value });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApplicationToDetail(app: any): ApplicationDetail {
  return {
    id: app._id.toString(),
    jobId: app.jobId.toString(),
    jobSnapshot: app.jobSnapshot,
    resumeId: app.resumeId?.toString(),
    resumeVersion: app.resumeVersion,
    matchScore: app.matchScore,
    matchEligible: app.matchEligible,
    matchExplanation: app.matchExplanation,
    mode: app.mode,
    materials: {
      coverLetter: app.materials?.coverLetter,
      answers: (app.materials?.answers ?? []).map((a: { question: string; answer: string; verified: boolean; sensitive: boolean }) => ({
        question: a.question,
        answer: a.answer,
        verified: a.verified,
        sensitive: a.sensitive,
      })),
      notes: app.materials?.notes,
      tailoredResume: app.materials?.tailoredResume,
    },
    materialsReviewedAt: app.materialsReviewedAt,
    materialsProvenance: app.materialsProvenance,
    status: app.status,
    decidedAt: app.decidedAt,
    decisionNote: app.decisionNote,
    attemptCount: app.attemptCount ?? 0,
    lastError: app.lastError,
    manualActionRequired: app.manualActionRequired,
    unverifiedConfirmedAt: app.unverifiedConfirmedAt,
    isCancelled: app.isCancelled ?? false,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export interface CreateApplicationInput {
  jobId: string;
  resumeId?: string;
  mode?: 'auto' | 'permission';
  materials?: {
    coverLetter?: string;
    answers?: Array<{ question: string; answer: string; verified?: boolean; sensitive?: boolean }>;
    notes?: string;
  };
  idempotencyKey?: string;
}

/** Answers that still need explicit candidate confirmation. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unverifiedAnswers(app: any): string[] {
  return ((app.materials?.answers ?? []) as Array<{ question: string; verified?: boolean }>)
    .filter((a) => !a.verified)
    .map((a) => a.question);
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function createApplication(
  userId: Types.ObjectId,
  input: CreateApplicationInput,
): Promise<ApplicationDetail> {
  const jobObjectId = parseObjectId(input.jobId, 'jobId');
  const job = await jobRepository.findByIdAndUserId(jobObjectId, userId);
  if (!job || (job as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', input.jobId);
  }

  let resumeObjectId: Types.ObjectId | undefined;
  let resumeVersion: number | undefined;
  if (input.resumeId) {
    const resume = await resumeRepository.findByIdAndUserId(parseObjectId(input.resumeId, 'resumeId'), userId);
    if (!resume || resume.status === 'deleted') {
      throw new NotFoundError('Resume', input.resumeId);
    }
    resumeObjectId = resume._id;
    resumeVersion = resume.version;
  }

  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }

  const existing = await applicationRepository.findLiveByUserIdAndJobId(userId, jobObjectId);
  if (existing) {
    throw new ConflictError('An application already exists for this job', {
      duplicateApplicationId: existing._id.toString(),
    });
  }

  const match = computeJobMatch(
    job as unknown as MatchableJob,
    profile as unknown as MatchableProfile,
  );

  try {
    const created = await applicationRepository.create({
      userId,
      jobId: jobObjectId,
      resumeId: resumeObjectId,
      resumeVersion,
      jobSnapshot: { title: job.title, companyName: job.companyName },
      matchScore: match.score,
      matchEligible: match.eligible,
      matchExplanation: {
        score: match.score,
        eligible: match.eligible,
        eligibilityReasons: match.eligibilityReasons,
        factors: match.factors,
        missingData: match.missingData,
        evaluatedWeight: match.evaluatedWeight,
      },
      mode: input.mode ?? 'permission',
      materials: input.materials
        ? {
            coverLetter: input.materials.coverLetter,
            answers: (input.materials.answers ?? []).map((a) => ({
              question: a.question,
              answer: a.answer,
              verified: a.verified ?? false,
              sensitive: a.sensitive ?? false,
            })),
            notes: input.materials.notes,
          }
        : undefined,
      idempotencyKey: input.idempotencyKey,
    });
    await applicationRepository.logEvent({
      applicationId: created._id,
      userId,
      type: 'created',
      toStatus: 'DRAFT',
      message: `Draft created for job '${job.title}'`,
    });
    const fresh = await applicationRepository.findByIdAndUserId(created._id, userId);
    return mapApplicationToDetail(fresh ?? created);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const raced = await applicationRepository.findLiveByUserIdAndJobId(userId, jobObjectId);
      throw new ConflictError('An application already exists for this job', {
        duplicateApplicationId: raced?._id.toString(),
      });
    }
    throw err;
  }
}

export async function getApplication(userId: Types.ObjectId, applicationId: string): Promise<ApplicationDetail> {
  const app = await applicationRepository.findByIdAndUserId(parseObjectId(applicationId, 'applicationId'), userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  return mapApplicationToDetail(app);
}

export interface UpdateDraftInput {
  resumeId?: string;
  mode?: 'auto' | 'permission';
  materials?: CreateApplicationInput['materials'];
}

export async function updateDraft(
  userId: Types.ObjectId,
  applicationId: string,
  input: UpdateDraftInput,
): Promise<ApplicationDetail> {
  const appObjectId = parseObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (app.status !== 'DRAFT') {
    throw new ValidationError(`Only DRAFT applications can be edited (current status: ${app.status})`, {
      status: app.status,
    });
  }

  let resumeVersion: number | undefined;
  if (input.resumeId) {
    const resume = await resumeRepository.findByIdAndUserId(parseObjectId(input.resumeId, 'resumeId'), userId);
    if (!resume || resume.status === 'deleted') {
      throw new NotFoundError('Resume', input.resumeId);
    }
    resumeVersion = resume.version;
  }

  const updated = await applicationRepository.updateDraft(appObjectId, userId, {
    resumeId: input.resumeId ? parseObjectId(input.resumeId, 'resumeId') : undefined,
    resumeVersion,
    mode: input.mode,
    materials: input.materials
      ? {
          coverLetter: input.materials.coverLetter,
          answers: (input.materials.answers ?? []).map((a) => ({
            question: a.question,
            answer: a.answer,
            verified: a.verified ?? false,
            sensitive: a.sensitive ?? false,
          })),
          notes: input.materials.notes,
        }
      : undefined,
  });
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'updated',
    fromStatus: 'DRAFT',
    toStatus: 'DRAFT',
    message: 'Draft fields updated',
  });
  return mapApplicationToDetail(updated ?? app);
}

function requireConfirmationIfNeeded(app: { materials?: unknown }, confirmUnverified: boolean): string[] {
  const pending = unverifiedAnswers(app);
  if (pending.length > 0 && !confirmUnverified) {
    throw new ValidationError('Unverified answers require explicit confirmation', {
      unverifiedAnswers: pending,
    });
  }
  return pending;
}

export async function requestReview(
  userId: Types.ObjectId,
  applicationId: string,
  confirmUnverified = false,
): Promise<ApplicationDetail> {
  const appObjectId = parseObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (app.status !== 'DRAFT') {
    throw new ValidationError(`Only DRAFT applications can be sent for review (current status: ${app.status})`, {
      status: app.status,
    });
  }
  if (!app.resumeId) {
    throw new ValidationError('Select a resume before requesting review', { missing: ['resumeId'] });
  }
  const confirmed = requireConfirmationIfNeeded(app, confirmUnverified);

  // Permission mode needs an approval decision; auto mode is review-complete
  // and waits for a future authorized submission policy.
  const target = app.mode === 'permission' ? 'AWAITING_APPROVAL' : 'READY_FOR_REVIEW';
  assertTransitionAllowed(app.status, target, 'user');

  const extra: Record<string, unknown> = {};
  if (confirmed.length > 0) {
    extra.unverifiedConfirmedAt = new Date();
    await applicationRepository.logEvent({
      applicationId: appObjectId,
      userId,
      type: 'unverified_confirmed',
      fromStatus: app.status,
      toStatus: app.status,
      message: `Candidate confirmed ${confirmed.length} unverified answer(s): ${confirmed.join('; ')}`,
    });
  }
  const updated = await applicationRepository.updateStatus(appObjectId, userId, target, extra);
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'review_requested',
    fromStatus: 'DRAFT',
    toStatus: target,
    message: app.mode === 'permission' ? 'Sent for approval' : 'Marked ready for review',
  });
  return mapApplicationToDetail(updated ?? app);
}

export async function decideApplication(
  userId: Types.ObjectId,
  applicationId: string,
  decision: 'approve' | 'reject',
  note?: string,
  confirmUnverified = false,
): Promise<ApplicationDetail> {
  const appObjectId = parseObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (app.status !== 'READY_FOR_REVIEW' && app.status !== 'AWAITING_APPROVAL') {
    throw new ValidationError(`Only applications awaiting a decision can be decided (current status: ${app.status})`, {
      status: app.status,
    });
  }

  if (decision === 'reject') {
    assertTransitionAllowed(app.status, 'CANCELLED', 'user');
    const updated = await applicationRepository.updateStatus(appObjectId, userId, 'CANCELLED', {
      decidedAt: new Date(),
      decisionNote: note,
    });
    await applicationRepository.logEvent({
      applicationId: appObjectId,
      userId,
      type: 'rejected',
      fromStatus: app.status,
      toStatus: 'CANCELLED',
      message: note ?? 'Application rejected by candidate',
    });
    return mapApplicationToDetail(updated ?? app);
  }

  const confirmed = requireConfirmationIfNeeded(app, confirmUnverified || !!app.unverifiedConfirmedAt);
  assertTransitionAllowed(app.status, 'APPROVED', 'user');
  const extra: Record<string, unknown> = { decidedAt: new Date(), decisionNote: note };
  if (confirmed.length > 0 && !app.unverifiedConfirmedAt) {
    extra.unverifiedConfirmedAt = new Date();
  }
  const updated = await applicationRepository.updateStatus(appObjectId, userId, 'APPROVED', extra);
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'approved',
    fromStatus: app.status,
    toStatus: 'APPROVED',
    message: note ?? 'Application approved by candidate. No submission attempted.',
  });
  return mapApplicationToDetail(updated ?? app);
}

export async function cancelApplication(userId: Types.ObjectId, applicationId: string): Promise<ApplicationDetail> {
  const appObjectId = parseObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (!CANCELLABLE_FROM.includes(app.status)) {
    throw new ValidationError(`Applications in ${app.status} status cannot be cancelled`, { status: app.status });
  }
  assertTransitionAllowed(app.status, 'CANCELLED', 'user');
  const updated = await applicationRepository.updateStatus(appObjectId, userId, 'CANCELLED', {
    isCancelled: true,
  });
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'cancelled',
    fromStatus: app.status,
    toStatus: 'CANCELLED',
    message: 'Application cancelled by candidate',
  });
  return mapApplicationToDetail(updated ?? app);
}

export async function listApplications(
  userId: Types.ObjectId,
  options: { status?: string; jobId?: string; page?: number; pageSize?: number } = {},
) {
  const result = await applicationRepository.listByUserId(userId, {
    status: options.status,
    jobId: options.jobId ? parseObjectId(options.jobId, 'jobId') : undefined,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 20,
  });
  return {
    applications: result.applications.map(mapApplicationToDetail),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

export async function getAuditHistory(userId: Types.ObjectId, applicationId: string) {
  const appObjectId = parseObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  const events = await applicationRepository.listEvents(appObjectId, userId);
  return events.map((e) => ({
    id: e._id.toString(),
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    message: e.message,
    createdAt: e.createdAt,
  }));
}
