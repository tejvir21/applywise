import {
  SubmissionAdapter,
  SubmissionRequest,
  SubmissionResult,
  VerificationResult,
} from './SubmissionAdapter.js';

export type MockOutcome = 'success' | 'failure' | 'uncertain';

export class MockSubmissionAdapter implements SubmissionAdapter {
  readonly platform = 'mock';
  readonly displayName = 'Mock Submission Adapter (simulated)';
  readonly isMock = true;

  private outcome: MockOutcome;

  constructor(outcome: MockOutcome = 'success') {
    this.outcome = outcome;
  }

  setOutcome(outcome: MockOutcome): void {
    this.outcome = outcome;
  }

  async submit(request: SubmissionRequest): Promise<SubmissionResult> {
    const attemptedAt = new Date();
    if (this.outcome === 'failure') {
      return {
        mock: true,
        outcome: 'failed',
        message: 'Simulated definite execution failure (no real submission)',
        attemptedAt,
      };
    }
    if (this.outcome === 'uncertain') {
      return {
        mock: true,
        outcome: 'manual_required',
        message: 'Simulated uncertain execution outcome (no real submission)',
        attemptedAt,
      };
    }
    return {
      mock: true,
      outcome: 'submitted',
      confirmationId: `mock-${request.idempotencyKey}`,
      message: 'Simulated successful execution (NOT a real submission)',
      attemptedAt,
      submittedAt: attemptedAt,
    };
  }

  async verify(confirmationId: string): Promise<VerificationResult> {
    return { mock: true, status: 'unknown', checkedAt: new Date(), details: `mock verify ${confirmationId}` };
  }
}
