/**
 * Application submission contracts (Phase 8).
 *
 * Discovery (JobSourceAdapter) and submission are deliberately separate
 * interfaces: a source that can find jobs gains NO submission privileges.
 * These contracts describe what a platform submission integration must
 * implement; only the explicitly-labeled mock adapter implements them today.
 */

export type ApplicationQuestionType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'file'
  | 'boolean'
  | 'date';

export interface ApplicationQuestion {
  id: string;
  label: string;
  type: ApplicationQuestionType;
  required: boolean;
  options?: string[];
  maxLength?: number;
}

export interface SubmissionAnswer {
  questionId: string;
  value: string | string[] | boolean;
}

export interface SubmissionRequest {
  applicationId: string;
  /** The platform's own application page this submission targets. */
  jobUrl: string;
  answers: SubmissionAnswer[];
  /** Resume/document storage keys the platform is authorized to receive. */
  documentIds: string[];
  /** Client idempotency key: retries with the same key must not duplicate. */
  idempotencyKey: string;
}

export type SubmissionOutcome = 'submitted' | 'rejected' | 'failed' | 'manual_required';

export interface SubmissionResult {
  /** Always true for the mock adapter; real adapters set false. */
  mock: boolean;
  outcome: SubmissionOutcome;
  confirmationId?: string;
  message: string;
  attemptedAt: Date;
  submittedAt?: Date;
}

export type VerificationStatus = 'confirmed' | 'not_found' | 'unknown';

export interface VerificationResult {
  mock: boolean;
  status: VerificationStatus;
  checkedAt: Date;
  details?: string;
}

/**
 * Authorized submission adapter. Implementations must only perform actions
 * the platform explicitly permits (no CAPTCHA/MFA/anti-bot bypasses, no
 * private APIs, no session-cookie reuse). Nothing registers here without
 * verified authorization.
 */
export interface SubmissionAdapter {
  readonly platform: string;
  readonly displayName: string;
  /** True only for deterministic test doubles. Never a real submission. */
  readonly isMock: boolean;
  submit(request: SubmissionRequest): Promise<SubmissionResult>;
  verify?(confirmationId: string): Promise<VerificationResult>;
}

export class SubmissionRegistry {
  private adapters = new Map<string, SubmissionAdapter>();

  register(adapter: SubmissionAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: string): SubmissionAdapter | undefined {
    return this.adapters.get(platform);
  }

  getAll(): SubmissionAdapter[] {
    return Array.from(this.adapters.values());
  }
}

/** Global registry. Empty until an authorized adapter is registered. */
export const submissionRegistry = new SubmissionRegistry();
