/**
 * Browser Automation Engine (Phase 9.0).
 *
 * Orchestrates browser-based form inspection, field mapping, and filling.
 * Does NOT submit applications — final submission remains disabled.
 */

import { BrowserSessionManager } from './BrowserSessionManager.js';
import { FormFieldExtractor, type ExtractedForm, type ExtractedField } from './FormFieldExtractor.js';
import { CandidateFieldMapper, type CandidateData, type FieldMapping } from './CandidateFieldMapper.js';
import { ApplicationFormFiller, type FillSummary } from './ApplicationFormFiller.js';
import {
  ChallengeDetectedError,
  type ChallengePersistence,
} from './ChallengeError.js';

export type ExecutionState =
  | 'CREATED'
  | 'INSPECTING'
  | 'FORM_DETECTED'
  | 'AWAITING_CANDIDATE_INPUT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED_FOR_EXECUTION'
  | 'FILLING'
  | 'FILLED'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_MANUAL_ACTION';

export interface ExecutionRecord {
  id: string;
  userId: string;
  jobId?: string;
  platform?: string;
  applicationUrl: string;
  state: ExecutionState;
  form?: ExtractedForm;
  mappings?: FieldMapping[];
  fillSummary?: FillSummary;
  errors: string[];
  createdAt: Date;
  updatedAt: Date;
  approvedForExecution: boolean;
}

export interface InspectionResult {
  form: ExtractedForm;
  mappings: FieldMapping[];
  needsCandidateInput: FieldMapping[];
  readyForReview: boolean;
}

export interface ExecutionContext {
  executionId: string;
  userId: string;
}

export class BrowserAutomationEngine {
  private sessionManager: BrowserSessionManager;
  private formExtractor: FormFieldExtractor;
  private fieldMapper: CandidateFieldMapper;
  private formFiller: ApplicationFormFiller;
  private persistence?: ChallengePersistence;

  constructor(persistence?: ChallengePersistence) {
    this.sessionManager = new BrowserSessionManager();
    this.formExtractor = new FormFieldExtractor();
    this.fieldMapper = new CandidateFieldMapper();
    this.formFiller = new ApplicationFormFiller();
    this.persistence = persistence;
  }

  async initialize(): Promise<void> {
    await this.sessionManager.initialize();
  }

  async createSession(sessionId: string, options?: { timeoutMs?: number; userAgent?: string; viewport?: { width: number; height: number } }, ownership?: { executionId: string; ownerId: string }): Promise<void> {
    await this.sessionManager.createSession(sessionId, options, ownership);
  }

  async inspectPage(
    sessionId: string,
    url: string,
    executionContext?: ExecutionContext,
  ): Promise<InspectionResult> {
    // Validate URL first (SSRF protection) before any session lookup
    this.validateUrl(url);

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    await session.page.goto(url, { waitUntil: 'domcontentloaded' });

    // Detect CAPTCHA/OTP/login challenges before form extraction
    const challenge = await this.detectChallenge(session.page);
    if (challenge) {
      await this.persistChallenge(sessionId, executionContext, challenge);
      await this.sessionManager.closeSession(sessionId);
      throw new ChallengeDetectedError(challenge, challenge);
    }

    const form = await this.formExtractor.extractForm(session.page);
    const mappings = this.fieldMapper.mapFields(form.fields, {} as CandidateData);
    const needsCandidateInput = mappings.filter(
      (m) => m.result === 'NEEDS_CANDIDATE_INPUT' || m.result === 'UNSUPPORTED',
    );

    return {
      form,
      mappings,
      needsCandidateInput,
      readyForReview: needsCandidateInput.length === 0,
    };
  }

  /** Persist a challenge as PAUSED state before the operation returns. */
  private async persistChallenge(
    sessionId: string,
    executionContext: ExecutionContext | undefined,
    challenge: string,
  ): Promise<void> {
    if (!executionContext || !this.persistence) {
      return;
    }
    await this.persistence.pauseExecution(
      executionContext.executionId,
      executionContext.userId,
      challenge,
      challenge,
    );
  }

  /** Detect CAPTCHA, OTP, login challenges, or other manual intervention requirements. */
  async detectChallenge(page: any): Promise<string | null> {
    try {
      // Check for CAPTCHA iframes/widgets
      const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="captcha"]',
        '.g-recaptcha',
        '.h-captcha',
        '[data-sitekey]',
        '#captcha',
        '.captcha-container',
      ];
      for (const selector of captchaSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          return 'CAPTCHA detected — manual solving required';
        }
      }

      // Check for OTP/verification code inputs
      const otpSelectors = [
        'input[name*="otp"]',
        'input[name*="verification"]',
        'input[name*="code"]',
        'input[autocomplete="one-time-code"]',
        'input[placeholder*="verification code"]',
        'input[placeholder*="OTP"]',
      ];
      for (const selector of otpSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          return 'OTP/verification code required — manual input needed';
        }
      }

      // Check for login forms (session expired)
      const loginSelectors = [
        'input[type="password"][name*="password"]',
        'form[action*="login"]',
        'form[action*="signin"]',
      ];
      for (const selector of loginSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          // Only flag if there's no application form (might be a login page)
          const appFormCount = await page.locator('form#application-form, form.application-form').count();
          if (appFormCount === 0) {
            return 'Login required — session may have expired';
          }
        }
      }

      // Check page text for challenge keywords
      const bodyText = await page.textContent('body').catch(() => '');
      const challengeKeywords = [
        'captcha', 'verify you are human', 'security check',
        'verification code', 'one-time password', 'otp',
        'please log in', 'session expired', 'sign in to continue',
      ];
      const lowerText = (bodyText || '').toLowerCase();
      for (const keyword of challengeKeywords) {
        if (lowerText.includes(keyword)) {
          return `Challenge detected: "${keyword}" — manual intervention required`;
        }
      }

      return null;
    } catch {
      return null; // Don't fail inspection if challenge detection errors
    }
  }

  async fillForm(
    sessionId: string,
    fields: ExtractedField[],
    mappings: FieldMapping[],
    options?: { resumeId?: string; userId?: string },
    executionContext?: ExecutionContext,
  ): Promise<FillSummary> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Detect challenges before filling
    const challenge = await this.detectChallenge(session.page);
    if (challenge) {
      await this.persistChallenge(sessionId, executionContext, challenge);
      await this.sessionManager.closeSession(sessionId);
      throw new ChallengeDetectedError(challenge, challenge);
    }

    const summary = await this.formFiller.fillForm(session.page, fields, mappings, options);

    // Detect challenges after filling (page may have redirected)
    const postChallenge = await this.detectChallenge(session.page);
    if (postChallenge) {
      await this.persistChallenge(sessionId, executionContext, postChallenge);
      await this.sessionManager.closeSession(sessionId);
      throw new ChallengeDetectedError(postChallenge, postChallenge);
    }

    // Successful fill — close the session now that filling is complete.
    await this.sessionManager.closeSession(sessionId);

    return summary;
  }

  /** Close the browser session associated with an execution, if any. */
  async closeSessionForExecution(executionId: string, userId: string): Promise<boolean> {
    const session = this.sessionManager.findSessionByExecution(executionId);
    if (!session) return false;

    const owner = this.sessionManager.getOwner(session.id);
    if (owner && (owner.executionId !== executionId || owner.ownerId !== userId)) {
      return false;
    }

    try {
      await this.sessionManager.closeSession(session.id, { executionId, ownerId: userId });
    } catch {
      // best-effort; session is removed regardless
    }
    return true;
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.sessionManager.closeSession(sessionId);
  }

  getSession(sessionId: string): { page: any; id: string } | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  async closeAll(): Promise<void> {
    await this.sessionManager.closeAll();
  }

  private validateUrl(url: string): void {
    // Basic URL validation and SSRF protection
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }

    // Allow http, https, and file:// (file:// for local test fixtures only)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }

    // file:// is only for local test fixtures — block sensitive paths
    if (parsed.protocol === 'file:') {
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.includes('/etc/') || pathname.includes('/proc/') || pathname.includes('system32') || pathname.includes('/windows/')) {
        throw new Error('Access to sensitive file paths is not allowed');
      }
      return; // Allow file:// for test fixtures
    }

    // Block localhost and internal IPs (SSRF protection for HTTP/HTTPS)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    ) {
      throw new Error('Internal/private URLs are not allowed');
    }
  }
}

export const browserAutomationEngine = new BrowserAutomationEngine();

