/**
 * Challenge detected error (Phase 9.1.15).
 *
 * Thrown by the BrowserAutomationEngine when a CAPTCHA, OTP, login or other
 * authentication barrier is encountered during inspection or filling.
 * Carries the challenge type and a safe reason for persistence and UI display.
 * Never contains credentials, OTP values, passwords or CAPTCHA contents.
 */

export class ChallengeDetectedError extends Error {
  readonly challengeType: string;
  readonly reason: string;

  constructor(challengeType: string, reason: string) {
    super(`Challenge detected: ${challengeType}. ${reason}`);
    this.name = 'ChallengeDetectedError';
    this.challengeType = challengeType;
    this.reason = reason;
  }
}

export interface ChallengePersistence {
  pauseExecution(
    executionId: string,
    userId: string,
    challengeType: string,
    reason: string,
  ): Promise<void>;
}
