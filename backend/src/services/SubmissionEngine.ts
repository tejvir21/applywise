import { Types } from 'mongoose';
import { evaluateApplicationPolicy } from './PlatformService.js';
import { SubmissionAttemptRepository } from '../repositories/SubmissionAttemptRepository.js';
import { computeRequestFingerprint } from '../models/SubmissionAttempt.js';
import { getApplication } from './ApplicationService.js';
import type { PolicyEvaluation } from '../platforms/SubmissionPolicy.js';

export interface ExecutionRequest {
  userId: string;
  applicationId: string;
  platform: string;
  idempotencyKey: string;
  materialsHash?: string;
  resumeVersion?: number;
}

export interface ExecutionResult {
  decision: PolicyEvaluation['decision'];
  reasons: string[];
  executed: false;
  attemptId?: string;
  executionState?: string;
}

type EvaluatePolicy = (
  userId: Types.ObjectId,
  applicationId: string,
  platform: string,
) => Promise<PolicyEvaluation>;

export class SubmissionEngine {
  private readonly evaluatePolicy: EvaluatePolicy;

  constructor(evaluatePolicy?: EvaluatePolicy) {
    this.evaluatePolicy = evaluatePolicy ?? evaluateApplicationPolicy;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!request.userId || !request.applicationId || !request.platform || !request.idempotencyKey) {
      throw new Error('Missing required fields');
    }
    const policy = await this.evaluatePolicy(
      new Types.ObjectId(request.userId),
      request.applicationId,
      request.platform,
    );

    if (policy.decision !== 'auto_allowed') {
      return { decision: policy.decision, reasons: policy.reasons, executed: false };
    }

    const app = await getApplication(new Types.ObjectId(request.userId), request.applicationId);
    const fingerprint = computeRequestFingerprint({
      applicationId: request.applicationId,
      platform: request.platform,
      materialsHash: request.materialsHash ?? '',
      resumeVersion: request.resumeVersion ?? app.resumeVersion,
    });

    const { attempt } = await new SubmissionAttemptRepository().createOrGet(
      new Types.ObjectId(request.userId),
      new Types.ObjectId(request.applicationId),
      request.platform,
      request.idempotencyKey,
      fingerprint,
      {},
    );

    return {
      decision: policy.decision,
      reasons: policy.reasons,
      executed: false,
      attemptId: attempt._id.toString(),
      executionState: attempt.executionState,
    };
  }
}
