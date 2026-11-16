import { Types } from 'mongoose';
import { getApplication } from './ApplicationService.js';
import { evaluateApplicationPolicy } from './PlatformService.js';
import { submissionRegistry } from '../platforms/SubmissionAdapter.js';
import { getPlatform } from '../platforms/PlatformCapabilities.js';
import { JobRepository } from '../repositories/JobRepository.js';
import type { PolicyEvaluation } from '../platforms/SubmissionPolicy.js';

const jobRepository = new JobRepository();

export interface PreflightResult {
  applicationId: string;
  platform: string;
  decision: PolicyEvaluation['decision'];
  reasons: string[];
  requiresApproval: boolean;
  adapterAvailable: boolean;
  handoffEligible: boolean;
}

export async function preflightSubmission(
  userId: Types.ObjectId,
  applicationId: string,
  platform: string,
): Promise<PreflightResult> {
  const app = await getApplication(userId, applicationId);
  const policy = await evaluateApplicationPolicy(userId, applicationId, platform);

  const adapterAvailable = !!submissionRegistry.get(platform);

  let handoffEligible = app.status === 'APPROVED' || app.status === 'NEEDS_MANUAL_ACTION';
  if (handoffEligible) {
    const job = await jobRepository.findByIdAndUserId(new Types.ObjectId(app.jobId), userId);
    const url = (job as { applicationUrl?: string } | null)?.applicationUrl;
    if (!url) {
      handoffEligible = false;
    } else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') handoffEligible = false;
      } catch {
        handoffEligible = false;
      }
    }
    if (!job) handoffEligible = false;
  }

  return {
    applicationId,
    platform,
    decision: policy.decision,
    reasons: policy.reasons,
    requiresApproval: policy.decision === 'approval_required',
    adapterAvailable,
    handoffEligible,
  };
}
