/**
 * Submission policy evaluation (Phase 8).
 *
 * Pure, deterministic evaluation over an application, the platform
 * capability registry, and the user's settings. Fails closed: unknown
 * platforms, unverified capabilities, or missing data never authorize
 * automatic submission. This function decides; it never submits anything.
 *
 * Decisions:
 * - auto_allowed:      every automatic-submission condition holds.
 * - approval_required: a human must review/decide first.
 * - manual_only:       no authorized automatic path exists; safe user
 *                      handoff (open the platform page, complete manually).
 * - blocked:           do not proceed in any mode right now.
 */

import type { CapabilityStatus } from './PlatformCapabilities.js';
import { getPlatform } from './PlatformCapabilities.js';
import type { ApplicationStatus } from '../models/Application.js';
import { Types } from 'mongoose';
import { submissionRegistry } from './SubmissionAdapter.js';
import { getApplication } from '../services/ApplicationService.js';
import { getSubmissionSettings } from '../services/PlatformService.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { NotFoundError } from '../utils/errors.js';

export type SubmissionDecision = 'auto_allowed' | 'approval_required' | 'manual_only' | 'blocked';

export interface PolicySettings {
  globalPaused: boolean;
  dailyLimit: number;
  minMatchScore: number;
  submissionsToday: number;
  platformMode: 'auto' | 'permission' | 'disabled';
  platformAuthorized: boolean;
}

export interface PolicyInput {
  platform: string;
  platformKnown: boolean;
  capabilitySubmit: CapabilityStatus | undefined;
  adapterRegistered: boolean;
  applicationStatus: ApplicationStatus;
  applicationMode: 'auto' | 'permission';
  matchScore: number | null | undefined;
  matchEligible: boolean | undefined;
  unverifiedAnswerCount: number;
  liveDuplicate: boolean;
  settings: PolicySettings;
}

export interface PolicyEvaluation {
  decision: SubmissionDecision;
  reasons: string[];
}

export const DEFAULT_MIN_MATCH_SCORE = 80;

export function defaultPolicySettings(): PolicySettings {
  return {
    globalPaused: false,
    dailyLimit: 10,
    minMatchScore: DEFAULT_MIN_MATCH_SCORE,
    submissionsToday: 0,
    platformMode: 'permission',
    platformAuthorized: false,
  };
}

export function evaluateSubmissionPolicy(input: PolicyInput): PolicyEvaluation {
  const reasons: string[] = [];
  const { settings } = input;

  // 1. Fail closed on the unknown.
  if (!input.platformKnown || !input.capabilitySubmit || input.capabilitySubmit === 'unverified') {
    return { decision: 'blocked', reasons: [`Platform '${input.platform}' capability is unknown`] };
  }

  // 1b. Lifecycle gate...
  if (input.applicationStatus !== 'APPROVED') {
    const pending = ['DRAFT', 'READY_FOR_REVIEW', 'AWAITING_APPROVAL'].includes(input.applicationStatus);
    if (pending) {
      return { decision: 'approval_required', reasons: [`Application is ${input.applicationStatus}; approval required before submission`] };
    }
    return { decision: 'blocked', reasons: [`Application is in terminal/ineligible state ${input.applicationStatus}`] };
  }
  // 2. Global pause wins over everything.
  if (settings.globalPaused) {
    return { decision: 'blocked', reasons: ['Global pause is enabled'] };
  }
  // 3. Per-platform kill switch.
  if (settings.platformMode === 'disabled') {
    return { decision: 'blocked', reasons: [`Platform '${input.platform}' is disabled`] };
  }
  // 4. Duplicate live applications block any mode.
  if (input.liveDuplicate) {
    return { decision: 'blocked', reasons: ['A live application already exists for this job'] };
  }
  // 5. Daily attempt budget counts actual attempts (retries included upstream).
  if (settings.submissionsToday >= settings.dailyLimit) {
    return {
      decision: 'blocked',
      reasons: [`Daily submission limit reached (${settings.submissionsToday}/${settings.dailyLimit})`],
    };
  }
  // 6. No authorized automatic path -> soft handoff
  if (input.capabilitySubmit !== 'supported') {
    return {
      decision: 'manual_only',
      reasons: [`Platform '${input.platform}' capability is unknown`],
    };
  }
  if (!input.adapterRegistered) {
    return { decision: 'manual_only', reasons: [`Platform '${input.platform}' capability is unknown`] };
  }
  // 7. Soft gates below: human review required, never automatic.
  if (input.matchScore == null || input.matchScore < settings.dailyLimit) {
    reasons.push(
      input.matchScore == null
        ? 'Match score unknown'
        : `Match score ${input.matchScore} below threshold ${settings.dailyLimit}`,
    );
    return { decision: 'approval_required', reasons };
  }
  if (input.matchEligible === false) {
    reasons.push('Permission-based mode requires approval');
    return { decision: 'approval_required', reasons };
  }
  if (input.unverifiedAnswerCount > 0) {
    reasons.push(`${input.unverifiedAnswerCount} answer(s) need confirmation`);
    return { decision: 'approval_required', reasons };
  }
  if (input.applicationMode !== 'auto' || settings.platformMode !== 'auto') {
    reasons.push('Permission-based mode requires approval');
    return { decision: 'approval_required', reasons };
  }
  // User consent is configuration only; actual platform authorization must be
  // verified separately before a real adapter can be registered (fail-closed).
  if (!settings.platformAuthorized) {
    reasons.push(`Platform '${input.platform}' is not authorized for automatic submission`);
    return { decision: 'approval_required', reasons };
  }

  return { decision: 'auto_allowed', reasons: ['All automatic-submission conditions hold'] };
}

export async function getJobReadiness(
  userId: Types.ObjectId,
  applicationId: string,
  platform: string,
): Promise<{
  applicationId: string;
  jobId: string;
  platform: string;
  decision: PolicyEvaluation['decision'];
  reasons: string[];
  jobDetails: {
    id: string;
    title: string;
    platform: string;
  };
  policy: PolicyEvaluation;
}> {
  const app = await getApplication(new Types.ObjectId(userId), applicationId);
  const job = await new JobRepository().findById(app.jobId);
  if (!job) {
    throw new NotFoundError('Job', app.jobId.toString());
  }

  const platformKnown = !!getPlatform(platform);
  const adapterAuthorized = !!submissionRegistry.get(platform);
  const settings = await getSubmissionSettings(new Types.ObjectId(userId));

  // Preserve the platform's actual configured mode (including 'disabled');
  // never coerce 'disabled' into 'permission'. The application's own mode
  // ('auto' | 'permission') is a separate concern from the platform mode.
  const platformSetting = settings.platforms.find((p) => p.platform === platform);

  const policy = await evaluateSubmissionPolicy({
    platform,
    platformKnown,
    capabilitySubmit: platformKnown ? 'supported' : 'unverified',
    adapterRegistered: adapterAuthorized,
    applicationStatus: app.status as ApplicationStatus,
    applicationMode: app.mode,
    matchScore: null,
    matchEligible: false,
    unverifiedAnswerCount: 0,
    liveDuplicate: false,
    settings: {
      ...settings,
      platformMode: platformSetting?.mode ?? settings.platformMode,
      platformAuthorized: platformSetting?.authorized ?? settings.platformAuthorized,
    },
  });

  return {
    applicationId,
    jobId: app.jobId.toString(),
    platform,
    decision: policy.decision,
    reasons: policy.reasons,
    jobDetails: {
      id: job._id.toString(),
      title: job.title,
      platform: job.sources?.[0]?.name ?? 'unknown',
    },
    policy,
  };
}