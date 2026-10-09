/**
 * Deterministic mock submission adapter (Phase 8 testing only).
 *
 * Clearly labeled MOCK in every name, result, and confirmation ID. It
 * performs no network calls and submits nothing anywhere; scripted outcomes
 * let tests exercise success, rejection, failure, and manual-handoff paths
 * deterministically. It must never be presented as a real submission, and
 * registering it grants no platform privileges (policy treats mock outcomes
 * as test data, not authorizations).
 */

import type {
  SubmissionAdapter,
  SubmissionRequest,
  SubmissionResult,
  VerificationResult,
} from './SubmissionAdapter.js';

export type MockSubmissionOutcome = 'submitted' | 'rejected' | 'failed' | 'manual_required';

export class MockSubmissionAdapter implements SubmissionAdapter {
  readonly platform = 'mock-submit';
  readonly displayName = 'MOCK Submission (TEST ONLY — submits nothing)';
  readonly isMock = true;

  private scripted = new Map<string, MockSubmissionOutcome>();
  private seenIdempotencyKeys = new Map<string, SubmissionResult>();

  /** Script the next outcome for a given idempotency key (tests only). */
  scriptOutcome(idempotencyKey: string, outcome: MockSubmissionOutcome): void {
    this.scripted.set(idempotencyKey, outcome);
  }

  reset(): void {
    this.scripted.clear();
    this.seenIdempotencyKeys.clear();
  }

  async submit(request: SubmissionRequest): Promise<SubmissionResult> {
    const seen = this.seenIdempotencyKeys.get(request.idempotencyKey);
    if (seen) {
      return { ...seen, message: `${seen.message} (idempotent replay)` };
    }
    const outcome = this.scripted.get(request.idempotencyKey) ?? 'submitted';
    const attemptedAt = new Date();
    const base = {
      mock: true,
      attemptedAt,
    };
    let result: SubmissionResult;
    switch (outcome) {
      case 'submitted':
        result = {
          ...base,
          outcome: 'submitted',
          confirmationId: `mock-conf-${request.idempotencyKey}`,
          message: 'MOCK submission recorded (no real application was sent)',
          submittedAt: attemptedAt,
        };
        break;
      case 'rejected':
        result = { ...base, outcome: 'rejected', message: 'MOCK platform rejected the submission' };
        break;
      case 'failed':
        result = { ...base, outcome: 'failed', message: 'MOCK submission transport failed' };
        break;
      case 'manual_required':
        result = { ...base, outcome: 'manual_required', message: 'MOCK platform requires manual completion' };
        break;
    }
    this.seenIdempotencyKeys.set(request.idempotencyKey, result);
    return result;
  }

  async verify(confirmationId: string): Promise<VerificationResult> {
    const known = [...this.seenIdempotencyKeys.values()].some((r) => r.confirmationId === confirmationId);
    return {
      mock: true,
      status: known ? 'confirmed' : 'not_found',
      checkedAt: new Date(),
      details: known ? 'MOCK confirmation found in test-double ledger' : 'MOCK confirmation unknown',
    };
  }
}

export const mockSubmissionAdapter = new MockSubmissionAdapter();
