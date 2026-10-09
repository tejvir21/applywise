/** Platform settings, policy evaluation, and safe handoff (Phase 8). */

import { Types } from 'mongoose';
import { SubmissionSettingsModel } from '../models/SubmissionSettings.js';
import { ApplicationModel, ApplicationEventModel } from '../models/Application.js';
import { getPlatform, getCapability } from '../platforms/PlatformCapabilities.js';
import { submissionRegistry } from '../platforms/SubmissionAdapter.js';
import {
  evaluateSubmissionPolicy,
  defaultPolicySettings,
  type PolicyEvaluation,
} from '../platforms/SubmissionPolicy.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { getApplication, assertTransitionAllowed } from './ApplicationService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const applicationRepository = new ApplicationRepository();
const jobRepository = new JobRepository();

export interface PlatformSettingInput {
  platform: string;
  mode: 'auto' | 'permission' | 'disabled';
  authorized: boolean;
}

export interface SubmissionSettingsInput {
  globalPaused?: boolean;
  dailyLimit?: number;
  minMatchScore?: number;
  platforms?: PlatformSettingInput[];
}

function toObjectId(value: string, label: string): Types.ObjectId {
  try {
    return new Types.ObjectId(value);
  } catch {
    throw new ValidationError(`Invalid ${label}`, { [label]: value });
  }
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export async function getSubmissionSettings(userId: Types.ObjectId) {
  const stored = await SubmissionSettingsModel.findOne({ userId }).lean().exec();
  if (stored) {
    return {
      globalPaused: stored.globalPaused,
      dailyLimit: stored.dailyLimit,
      minMatchScore: stored.minMatchScore,
      platforms: stored.platforms,
    };
  }
  return { ...defaultPolicySettings(), platforms: [] as PlatformSettingInput[] };
}

export async function updateSubmissionSettings(userId: Types.ObjectId, input: SubmissionSettingsInput) {
  const update: Record<string, unknown> = {};
  if (input.globalPaused !== undefined) update.globalPaused = input.globalPaused;
  if (input.dailyLimit !== undefined) update.dailyLimit = input.dailyLimit;
  if (input.minMatchScore !== undefined) update.minMatchScore = input.minMatchScore;
  if (input.platforms !== undefined) update.platforms = input.platforms;
  const stored = await SubmissionSettingsModel.findOneAndUpdate({ userId }, { $set: update }, {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  }).lean().exec();
  return {
    globalPaused: stored!.globalPaused,
    dailyLimit: stored!.dailyLimit,
    minMatchScore: stored!.minMatchScore,
    platforms: stored!.platforms,
  };
}

export async function evaluateApplicationPolicy(
  userId: Types.ObjectId,
  applicationId: string,
  platform: string,
): Promise<PolicyEvaluation & { platform: string }> {
  const appObjectId = toObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }

  const descriptor = getPlatform(platform);
  const capability = getCapability(platform, 'submit');
  const settings = await getSubmissionSettings(userId);
  const platformSetting = settings.platforms.find((p) => p.platform === platform);

  // Count today's submission-attempt audit events across all of the user's
  // applications. No submission engine exists yet, so this is normally zero;
  // the wiring is real and covered with seeded events in tests.
  const counted = await ApplicationEventModel.countDocuments({
    userId,
    type: 'submission_attempted',
    createdAt: { $gte: startOfToday() },
  }).exec();

  const duplicate = await ApplicationModel.exists({
    userId,
    jobId: app.jobId,
    status: { $ne: 'CANCELLED' },
    _id: { $ne: appObjectId },
  });

  const evaluation = evaluateSubmissionPolicy({
    platform,
    platformKnown: !!descriptor,
    capabilitySubmit: capability?.status,
    adapterRegistered: !!submissionRegistry.get(platform),
    applicationStatus: app.status,
    applicationMode: app.mode,
    matchScore: app.matchScore,
    matchEligible: app.matchEligible,
    unverifiedAnswerCount: (app.materials?.answers ?? []).filter((a) => !a.verified).length,
    liveDuplicate: !!duplicate,
    settings: {
      globalPaused: settings.globalPaused,
      dailyLimit: settings.dailyLimit,
      minMatchScore: settings.minMatchScore,
      submissionsToday: counted,
      platformMode: platformSetting?.mode ?? 'permission',
      platformAuthorized: platformSetting?.authorized ?? false,
    },
  });
  return { ...evaluation, platform };
}

export interface HandoffResult {
  applicationUrl: string;
  instructions: string[];
  status: string;
}

/**
 * Safe user handoff for APPROVED applications: records the handoff, moves to
 * NEEDS_MANUAL_ACTION (system actor), and returns the platform URL plus
 * completion instructions. Opening the page never marks anything submitted.
 */
export async function requestHandoff(
  userId: Types.ObjectId,
  applicationId: string,
): Promise<{ application: Awaited<ReturnType<typeof getApplication>>; handoff: HandoffResult }> {
  const appObjectId = toObjectId(applicationId, 'applicationId');
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (app.status !== 'APPROVED' && app.status !== 'NEEDS_MANUAL_ACTION') {
    throw new ValidationError(`Handoff requires an APPROVED application (current status: ${app.status})`, {
      status: app.status,
    });
  }
  const job = await jobRepository.findByIdAndUserId(app.jobId, userId);
  const applicationUrl = (job as unknown as { applicationUrl?: string } | null)?.applicationUrl;
  if (!applicationUrl) {
    throw new ValidationError('This job has no application URL to hand off to', { jobId: app.jobId.toString() });
  }

  const instructions = [
    `Open the employer's application page: ${applicationUrl}`,
    app.resumeVersion
      ? `Upload resume version ${app.resumeVersion} (the file attached to this draft).`
      : 'Upload the resume file attached to this draft.',
    'Paste the reviewed cover letter from your saved drafts.',
    'Answer each application question from your saved draft answers.',
    'Confirm every unverified or sensitive declaration yourself on the platform page.',
    'Submit on the platform page, then keep your own confirmation record — this system cannot verify external submissions.',
  ];

  if (app.status === 'APPROVED') {
    assertTransitionAllowed('APPROVED', 'NEEDS_MANUAL_ACTION', 'system');
    await applicationRepository.updateStatus(appObjectId, userId, 'NEEDS_MANUAL_ACTION', {
      manualActionRequired: instructions.join('\n'),
    });
  }
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'handoff_opened',
    fromStatus: app.status,
    toStatus: 'NEEDS_MANUAL_ACTION',
    message: 'Candidate opened the platform application page (manual completion; nothing submitted)',
  });

  const application = await getApplication(userId, applicationId);
  return { application, handoff: { applicationUrl, instructions, status: application.status } };
}
