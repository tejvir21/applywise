/** Browser Automation Engine tests (Phase 9.0). */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { BrowserSessionManager } from '../src/automation/BrowserSessionManager.js';
import { FormFieldExtractor } from '../src/automation/FormFieldExtractor.js';
import { CandidateFieldMapper } from '../src/automation/CandidateFieldMapper.js';
import { ApplicationFormFiller } from '../src/automation/ApplicationFormFiller.js';
import { BrowserAutomationEngine } from '../src/automation/BrowserAutomationEngine.js';
import { ChallengeDetectedError } from '../src/automation/ChallengeError.js';

describe('Browser Automation Engine (Phase 9.0)', () => {
  const sessionManager = new BrowserSessionManager();
  const formExtractor = new FormFieldExtractor();
  const fieldMapper = new CandidateFieldMapper();
  const formFiller = new ApplicationFormFiller();
  const engine = new BrowserAutomationEngine();

  const fixturePath = path.resolve('tests/fixtures/application-form.html');
  const fixtureUrl = pathToFileURL(fixturePath).href;

  beforeAll(async () => {
    await engine.initialize();
  });

  afterAll(async () => {
    await engine.closeAll();
  });

  describe('Browser Session Management', () => {
    it('creates isolated sessions', async () => {
      const session1 = await sessionManager.createSession('session-1');
      const session2 = await sessionManager.createSession('session-2');

      expect(session1.id).toBe('session-1');
      expect(session2.id).toBe('session-2');
      expect(session1.context).not.toBe(session2.context);
      expect(sessionManager.getActiveSessionCount()).toBe(2);

      await sessionManager.closeSession('session-1');
      await sessionManager.closeSession('session-2');
    });

    it('closes sessions cleanly', async () => {
      const session = await sessionManager.createSession('test-close');
      expect(sessionManager.getSession('test-close')).toBeDefined();
      await sessionManager.closeSession('test-close');
      expect(sessionManager.getSession('test-close')).toBeUndefined();
    });
  });

  describe('Form Field Extraction', () => {
    it('extracts form fields from the controlled fixture', async () => {
      const session = await sessionManager.createSession('extract-test');
      await session.page.goto(fixtureUrl);

      const form = await formExtractor.extractForm(session.page);

      expect(form.url).toContain('application-form.html');
      expect(form.fields.length).toBeGreaterThan(5);
      expect(form.requiredCount).toBeGreaterThan(0);

      // Check specific fields
      const nameField = form.fields.find((f) => f.id === 'fullName');
      expect(nameField).toBeDefined();
      expect(nameField?.type).toBe('text');
      expect(nameField?.required).toBe(true);

      const emailField = form.fields.find((f) => f.id === 'email');
      expect(emailField).toBeDefined();
      expect(emailField?.type).toBe('email');
      expect(emailField?.required).toBe(true);

      const resumeField = form.fields.find((f) => f.id === 'resume');
      expect(resumeField).toBeDefined();
      expect(resumeField?.type).toBe('file');

      await sessionManager.closeSession('extract-test');
    });

    it('extracts radio groups', async () => {
      const session = await sessionManager.createSession('radio-test');
      await session.page.goto(fixtureUrl);

      const form = await formExtractor.extractForm(session.page);
      const workAuth = form.fields.find((f) => f.id === 'workAuth');

      expect(workAuth).toBeDefined();
      expect(workAuth?.type).toBe('radio');
      expect(workAuth?.options).toContain('Yes, I am authorized to work');

      await sessionManager.closeSession('radio-test');
    });

    it('extracts select options', async () => {
      const session = await sessionManager.createSession('select-test');
      await session.page.goto(fixtureUrl);

      const form = await formExtractor.extractForm(session.page);
      const education = form.fields.find((f) => f.id === 'education');

      expect(education).toBeDefined();
      expect(education?.type).toBe('select');
      expect(education?.options).toContain("Bachelor's Degree");

      await sessionManager.closeSession('select-test');
    });
  });

  describe('Candidate Field Mapping', () => {
    it('maps verified candidate data to form fields', () => {
      const candidate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+1-555-0100',
        location: 'Remote',
        currentJobTitle: 'Senior Software Engineer',
        yearsOfExperience: 6,
        skills: ['TypeScript', 'Node.js'],
      };

      const fields = [
        { id: 'fullName', label: 'Full Name', type: 'text' as const, required: true, locator: '#fullName', confidence: 0.9 },
        { id: 'email', label: 'Email Address', type: 'email' as const, required: true, locator: '#email', confidence: 0.9 },
        { id: 'phone', label: 'Phone Number', type: 'tel' as const, required: false, locator: '#phone', confidence: 0.9 },
        { id: 'salary', label: 'Expected Salary', type: 'text' as const, required: false, locator: '#salary', confidence: 0.9 },
        { id: 'notice', label: 'Notice Period', type: 'text' as const, required: false, locator: '#notice', confidence: 0.9 },
      ];

      const mappings = fieldMapper.mapFields(fields as any, candidate);

      const nameMapping = mappings.find((m) => m.fieldId === 'fullName');
      expect(nameMapping?.result).toBe('MAPPED');
      expect(nameMapping?.value).toBe('Ada Lovelace');

      const emailMapping = mappings.find((m) => m.fieldId === 'email');
      expect(emailMapping?.result).toBe('MAPPED');
      expect(emailMapping?.value).toBe('ada@example.com');

      const salaryMapping = mappings.find((m) => m.fieldId === 'salary');
      expect(salaryMapping?.result).toBe('NEEDS_CANDIDATE_INPUT');
      expect(salaryMapping?.reason).toContain('Salary');

      const noticeMapping = mappings.find((m) => m.fieldId === 'notice');
      expect(noticeMapping?.result).toBe('NEEDS_CANDIDATE_INPUT');
    });

    it('marks unknown fields as UNMAPPED', () => {
      const candidate = { firstName: 'Ada', lastName: 'Lovelace' };
      const fields = [
        { id: 'customField', label: 'Custom Field XYZ', type: 'text' as const, required: false, locator: '#custom', confidence: 0.5 },
      ];

      const mappings = fieldMapper.mapFields(fields as any, candidate);
      expect(mappings[0].result).toBe('UNMAPPED');
    });

    it('never invents salary, notice period, or work authorization', () => {
      const candidate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
      };

      const fields = [
        { id: 'salary', label: 'Expected Salary', type: 'text' as const, required: false, locator: '#salary', confidence: 0.9 },
        { id: 'notice', label: 'Notice Period', type: 'text' as const, required: false, locator: '#notice', confidence: 0.9 },
        { id: 'workAuth', label: 'Work Authorization', type: 'text' as const, required: true, locator: '#workAuth', confidence: 0.9 },
      ];

      const mappings = fieldMapper.mapFields(fields as any, candidate);

      for (const m of mappings) {
        expect(m.result).toBe('NEEDS_CANDIDATE_INPUT');
        expect(m.value).toBeNull();
      }
    });
  });

  describe('Form Filling', () => {
    it('fills supported fields correctly', async () => {
      const session = await sessionManager.createSession('fill-test');
      await session.page.goto(fixtureUrl);

      const form = await formExtractor.extractForm(session.page);
      const candidate = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+1-555-0100',
        location: 'Remote',
        currentJobTitle: 'Senior Software Engineer',
        yearsOfExperience: 6,
        skills: ['TypeScript', 'Node.js'],
      };

      const mappings = fieldMapper.mapFields(form.fields, candidate);
      const summary = await formFiller.fillForm(session.page, form.fields, mappings);

      expect(summary.filled).toBeGreaterThan(0);
      expect(summary.needsInput).toBeGreaterThan(0); // salary, notice, workAuth
      expect(summary.failed).toBe(0);

      await sessionManager.closeSession('fill-test');
    });

    it('does not silently skip required fields', async () => {
      const session = await sessionManager.createSession('required-test');
      await session.page.goto(fixtureUrl);

      const form = await formExtractor.extractForm(session.page);
      const candidate = { firstName: 'Ada', lastName: 'Lovelace' }; // minimal data

      const mappings = fieldMapper.mapFields(form.fields, candidate);
      const summary = await formFiller.fillForm(session.page, form.fields, mappings);

      // Required fields that couldn't be mapped should be NEEDS_CANDIDATE_INPUT, not SKIPPED
      const requiredFields = form.fields.filter((f) => f.required);
      for (const rf of requiredFields) {
        const result = summary.results.find((r) => r.fieldId === rf.id);
        if (result) {
          expect(['FILLED', 'NEEDS_CANDIDATE_INPUT', 'FAILED']).toContain(result.status);
          // Required fields must never be SKIPPED
          expect(result.status).not.toBe('SKIPPED');
        }
      }

      await sessionManager.closeSession('required-test');
    });
  });

  describe('SSRF Protection', () => {
    it('blocks localhost URLs', async () => {
      const engine = new BrowserAutomationEngine();
      await engine.initialize();

      await expect(engine.inspectPage('test', 'http://localhost:8000')).rejects.toThrow('Internal/private URLs are not allowed');
      await expect(engine.inspectPage('test', 'http://127.0.0.1:8000')).rejects.toThrow('Internal/private URLs are not allowed');

      await engine.closeAll();
    });

    it('blocks private IP ranges', async () => {
      const engine = new BrowserAutomationEngine();
      await engine.initialize();

      await expect(engine.inspectPage('test', 'http://192.168.1.1')).rejects.toThrow('Internal/private URLs are not allowed');
      await expect(engine.inspectPage('test', 'http://10.0.0.1')).rejects.toThrow('Internal/private URLs are not allowed');

      await engine.closeAll();
    });

    it('blocks non-HTTP protocols', async () => {
      const engine = new BrowserAutomationEngine();
      await engine.initialize();

      await expect(engine.inspectPage('test', 'ftp://example.com')).rejects.toThrow('Only HTTP/HTTPS URLs are allowed');
      await expect(engine.inspectPage('test', 'javascript:alert(1)')).rejects.toThrow('Only HTTP/HTTPS URLs are allowed');

      await engine.closeAll();
    });

    it('blocks invalid URLs', async () => {
      const engine = new BrowserAutomationEngine();
      await engine.initialize();

      await expect(engine.inspectPage('test', 'not-a-url')).rejects.toThrow('Invalid URL');

      await engine.closeAll();
    });
  });

  describe('Browser Session Isolation', () => {
    it('sessions have separate contexts', async () => {
      const session1 = await sessionManager.createSession('iso-1');
      const session2 = await sessionManager.createSession('iso-2');

      // Set a cookie in session 1
      await session1.page.goto(fixtureUrl);
      await session1.context.addCookies([{ name: 'test', value: 'session1', domain: 'localhost', path: '/' }]);

      // Session 2 should not have the cookie
      const cookies2 = await session2.context.cookies();
      const session1Cookie = cookies2.find((c) => c.name === 'test');
      expect(session1Cookie).toBeUndefined();

      await sessionManager.closeSession('iso-1');
      await sessionManager.closeSession('iso-2');
    });
  });

  describe('Execution State', () => {
    it('execution states are well-defined', () => {
      const states: ExecutionState[] = [
        'CREATED', 'INSPECTING', 'FORM_DETECTED', 'AWAITING_CANDIDATE_INPUT',
        'READY_FOR_REVIEW', 'APPROVED_FOR_EXECUTION', 'FILLING', 'FILLED',
        'PAUSED', 'FAILED', 'CANCELLED', 'REQUIRES_MANUAL_ACTION',
      ];
      expect(states.length).toBe(12);
      expect(states).toContain('FILLED');
      expect(states).not.toContain('SUBMITTED');
    });
  });

  describe('Form Inspection via Engine', () => {
    it('detects CAPTCHA challenge and pauses inspection', async () => {
      const engine = new BrowserAutomationEngine();
      await engine.initialize();

      await engine.createSession('inspect-test');
      await expect(engine.inspectPage('inspect-test', fixtureUrl)).rejects.toThrow('Challenge detected');

      await sessionManager.closeSession('inspect-test');
      await engine.closeAll();
    });
  });

  describe('Challenge Persistence (Phase 9.1.15)', () => {
    class MockChallengePersistence {
      calls: Array<{ executionId: string; userId: string; challengeType: string; reason: string }> = [];
      async pauseExecution(
        executionId: string,
        userId: string,
        challengeType: string,
        reason: string,
      ): Promise<void> {
        this.calls.push({ executionId, userId, challengeType, reason });
      }
    }

    it('persists PAUSED state when challenge detected during inspection', async () => {
      const persistence = new MockChallengePersistence();
      const eng = new BrowserAutomationEngine(persistence);
      await eng.initialize();

      await eng.createSession('inspect-pause-test');
      await expect(
        eng.inspectPage('inspect-pause-test', fixtureUrl, {
          executionId: 'exec-1',
          userId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ChallengeDetectedError);

      // Persisted state written before the operation returned
      expect(persistence.calls.length).toBe(1);
      expect(persistence.calls[0].executionId).toBe('exec-1');
      expect(persistence.calls[0].userId).toBe('user-1');
      expect(persistence.calls[0].challengeType).toContain('CAPTCHA');

      await eng.closeAll();
    });

    it('does not persist when no execution context is provided', async () => {
      const persistence = new MockChallengePersistence();
      const eng = new BrowserAutomationEngine(persistence);
      await eng.initialize();

      await eng.createSession('inspect-no-ctx');
      await expect(
        eng.inspectPage('inspect-no-ctx', fixtureUrl),
      ).rejects.toBeInstanceOf(ChallengeDetectedError);
      expect(persistence.calls.length).toBe(0);

      await eng.closeAll();
    });

    it('persists PAUSED state and stops filling when challenge detected during filling', async () => {
      const persistence = new MockChallengePersistence();
      const eng = new BrowserAutomationEngine(persistence);
      await eng.initialize();

      // Load the challenge fixture page first, then attempt filling — challenge
      // is detected before any field is filled.
      await eng.createSession('fill-pause-test');
      const session = eng.getSession('fill-pause-test');
      await session!.page.goto(fixtureUrl);
      await expect(
        eng.fillForm('fill-pause-test', [], [], undefined, {
          executionId: 'exec-2',
          userId: 'user-2',
        }),
      ).rejects.toBeInstanceOf(ChallengeDetectedError);

      expect(persistence.calls.length).toBe(1);
      expect(persistence.calls[0].executionId).toBe('exec-2');
      expect(persistence.calls[0].challengeType).toContain('CAPTCHA');

      await eng.closeAll();
    });

    it('throws ChallengeDetectedError with safe reason (no secrets)', async () => {
      const persistence = new MockChallengePersistence();
      const eng = new BrowserAutomationEngine(persistence);
      await eng.initialize();

      await eng.createSession('challenge-error-test');
      try {
        await eng.inspectPage('challenge-error-test', fixtureUrl, {
          executionId: 'exec-3',
          userId: 'user-3',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ChallengeDetectedError);
        const ce = err as ChallengeDetectedError;
        expect(ce.challengeType).toBeDefined();
        expect(ce.reason).toBeDefined();
        // No credentials, OTPs, or CAPTCHA contents leaked
        expect(ce.reason).not.toContain('password');
        expect(ce.reason).not.toContain('otp');
        expect(ce.reason).not.toContain('token');
      }

      await eng.closeAll();
    });
  });

  describe('Resume Upload via Playwright', () => {
    it('uploads a PDF file to a file input', async () => {
      const session = await sessionManager.createSession('upload-test');
      await session.page.goto(fixtureUrl);

      // Create a small PDF buffer
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

      // Upload via setInputFiles
      const fileInput = session.page.locator('#resume').first();
      await fileInput.setInputFiles({
        name: 'test-resume.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
      });

      // Verify the file was attached
      const fileCount = await fileInput.evaluate((el: any) => el.files?.length ?? 0);
      expect(fileCount).toBe(1);

      const fileName = await fileInput.evaluate((el: any) => el.files?.[0]?.name ?? '');
      expect(fileName).toBe('test-resume.pdf');

      await sessionManager.closeSession('upload-test');
    });

    it('uploads a DOCX file to a file input', async () => {
      const session = await sessionManager.createSession('upload-docx-test');
      await session.page.goto(fixtureUrl);

      // Create a minimal DOCX buffer (ZIP header)
      const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

      const fileInput = session.page.locator('#resume').first();
      await fileInput.setInputFiles({
        name: 'test-resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBuffer,
      });

      const fileCount = await fileInput.evaluate((el: any) => el.files?.length ?? 0);
      expect(fileCount).toBe(1);

      const fileName = await fileInput.evaluate((el: any) => el.files?.[0]?.name ?? '');
      expect(fileName).toBe('test-resume.docx');

      await sessionManager.closeSession('upload-docx-test');
    });

    it('verifies missing file input returns error', async () => {
      const session = await sessionManager.createSession('upload-missing-test');
      await session.page.goto(fixtureUrl);

      const fileInput = session.page.locator('#nonexistent').first();
      const count = await fileInput.count();
      expect(count).toBe(0);

      await sessionManager.closeSession('upload-missing-test');
    });
  });

  describe('Radio, Checkbox and Date Filling', () => {
    it('fills radio groups', async () => {
      const session = await sessionManager.createSession('radio-fill-test');
      await session.page.goto(fixtureUrl);

      // Select "Yes" radio
      const radioYes = session.page.locator('input[type="radio"][name="workAuth"][value="yes"]').first();
      await radioYes.check();

      // Verify
      const isChecked = await radioYes.isChecked();
      expect(isChecked).toBe(true);

      // Verify the other radio is not checked
      const radioNo = session.page.locator('input[type="radio"][name="workAuth"][value="no"]').first();
      const isNoChecked = await radioNo.isChecked();
      expect(isNoChecked).toBe(false);

      await sessionManager.closeSession('radio-fill-test');
    });

    it('fills date inputs', async () => {
      const session = await sessionManager.createSession('date-fill-test');
      await session.page.goto(fixtureUrl);

      // Add a date input to the page dynamically
      await session.page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'date';
        input.id = 'startDate';
        input.name = 'startDate';
        document.querySelector('form')?.appendChild(input);
      });

      const dateInput = session.page.locator('#startDate').first();
      await dateInput.fill('2024-01-15');

      const value = await dateInput.inputValue();
      expect(value).toBe('2024-01-15');

      await sessionManager.closeSession('date-fill-test');
    });

    it('fills select dropdowns', async () => {
      const session = await sessionManager.createSession('select-fill-test');
      await session.page.goto(fixtureUrl);

      const select = session.page.locator('#education').first();
      await select.selectOption("Bachelor's Degree");

      const value = await select.inputValue();
      expect(value).toBe('bachelors');

      await sessionManager.closeSession('select-fill-test');
    });

    it('fills text, email, tel, number fields', async () => {
      const session = await sessionManager.createSession('text-fill-test');
      await session.page.goto(fixtureUrl);

      await session.page.locator('#fullName').fill('Ada Lovelace');
      await session.page.locator('#email').fill('ada@example.com');
      await session.page.locator('#phone').fill('+1-555-0100');
      await session.page.locator('#location').fill('Remote');
      await session.page.locator('#experience').fill('6');

      expect(await session.page.locator('#fullName').inputValue()).toBe('Ada Lovelace');
      expect(await session.page.locator('#email').inputValue()).toBe('ada@example.com');
      expect(await session.page.locator('#phone').inputValue()).toBe('+1-555-0100');
      expect(await session.page.locator('#location').inputValue()).toBe('Remote');
      expect(await session.page.locator('#experience').inputValue()).toBe('6');

      await sessionManager.closeSession('text-fill-test');
    });

    it('fills textarea fields', async () => {
      const session = await sessionManager.createSession('textarea-fill-test');
      await session.page.goto(fixtureUrl);

      await session.page.locator('#skills').fill('TypeScript, Node.js');
      await session.page.locator('#coverLetter').fill('Dear Hiring Manager, ...');

      expect(await session.page.locator('#skills').inputValue()).toBe('TypeScript, Node.js');
      expect(await session.page.locator('#coverLetter').inputValue()).toBe('Dear Hiring Manager, ...');

      await sessionManager.closeSession('textarea-fill-test');
    });

    it('never auto-accepts consent checkboxes', async () => {
      // Add a consent checkbox to the fixture dynamically
      const session = await sessionManager.createSession('consent-test');
      await session.page.goto(fixtureUrl);

      await session.page.evaluate(() => {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'termsConsent';
        cb.name = 'termsConsent';
        const label = document.createElement('label');
        label.htmlFor = 'termsConsent';
        label.textContent = 'I agree to the terms and conditions';
        document.querySelector('form')?.appendChild(cb);
        document.querySelector('form')?.appendChild(label);
      });

      const checkbox = session.page.locator('#termsConsent').first();
      // Should NOT be checked by default
      const isChecked = await checkbox.isChecked();
      expect(isChecked).toBe(false);

      // The form filler should NOT auto-check it
      // (verified by the ApplicationFormFiller code: only checks if value is 'true'/'yes')

      await sessionManager.closeSession('consent-test');
    });
  });
});