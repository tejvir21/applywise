/**
 * Authorization-aware submission policy (Phase 8).
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
import type { ApplicationStatus } from '../models/Application.js';

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
  // 6. No authorized automatic path -> safe handoff, never auto-submit.
  if (input.capabilitySubmit !== 'supported') {
    return {
      decision: 'manual_only',
      reasons: [`Platform '${input.platform}' has no verified automatic submission (submit: ${input.capabilitySubmit})`],
    };
  }
  if (!input.adapterRegistered) {
    return { decision: 'manual_only', reasons: [`No submission adapter registered for '${input.platform}'`] };
  }

  // 7. Soft gates below: human review required, never automatic.
  if (input.matchScore == null || input.matchScore < settings.minMatchScore) {
    reasons.push(
      input.matchScore == null
        ? 'Match score unknown'
        : `Match score ${input.matchScore} below threshold ${settings.minMatchScore}`,
    );
    return { decision: 'approval_required', reasons };
  }
  if (input.matchEligible === false) {
    reasons.push('Hard eligibility flags require a human decision');
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
  if (!settings.platformAuthorized) {
    reasons.push(`Platform '${input.platform}' is not authorized for automatic submission`);
    return { decision: 'approval_required', reasons };
  }

  return { decision: 'auto_allowed', reasons: ['All automatic-submission conditions hold'] };
}
