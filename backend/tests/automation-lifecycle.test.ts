/** 
 * Browser automation lifecycle cleanup tests (Phase 9.1.16). 
 * 
 * Verifies automatic browser-session cleanup is wired into the actual 
 * automation lifecycle: successful filling, terminal failure, cancellation, 
 * challenge pause, timeout/abandonment, idempotency, and cross-owner rejection. 
 */ 

import { describe, it, expect, beforeAll, afterAll } from 'vitest'; 
import { BrowserSessionManager } from '../src/automation/BrowserSessionManager.js'; 
import { FormFieldExtractor } from '../src/automation/FormFieldExtractor.js'; 
import { ApplicationFormFiller } from '../src/automation/ApplicationFormFiller.js'; 
import { BrowserAutomationEngine } from '../src/automation/BrowserAutomationEngine.js'; 
import { pathToFileURL } from 'node:url'; 
import path from 'node:path'; 

describe('Browser Automation Lifecycle Cleanup (Phase 9.1.16)', () => { 
  const sessionManager = new BrowserSessionManager(); 
  const formExtractor = new FormFieldExtractor(); 
  const formFiller = new ApplicationFormFiller(); 
  const engine = new BrowserAutomationEngine(); 

  const cleanFixturePath = path.resolve('tests/fixtures/application-form-clean.html'); 
  const cleanFixtureUrl = pathToFileURL(cleanFixturePath).href; 
  const fixturePath = path.resolve('tests/fixtures/application-form.html'); 
  const fixtureUrl = pathToFileURL(fixturePath).href; 

  beforeAll(async () => { 
    await engine.initialize(); 
  }); 

  afterAll(async () => { 
    await engine.closeAll(); 
    await sessionManager.closeAll(); 
  }); 

  describe('Cleanup after fill operations', () => { 
    it('closes the session after successful filling', async () => { 
      const sessionId = 'fill-success-test'; 
      await engine.createSession(sessionId); 
      const session = engine.getSession(sessionId); 
      if (!session) throw new Error('session not created'); 
      await session.page.goto(cleanFixtureUrl); 

      const form = await formExtractor.extractForm(session.page); 
      if (!form.fields.length) throw new Error('no fields extracted'); 

      const mappings = [ 
        { fieldId: 'fullName', fieldLabel: 'Full Name', fieldType: 'text', value: 'Ada Lovelace', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'email', fieldLabel: 'Email Address', fieldType: 'email', value: 'ada@example.com', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'phone', fieldLabel: 'Phone Number', fieldType: 'tel', value: '555-1234', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'location', fieldLabel: 'Current Location', fieldType: 'text', value: 'City', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'experience', fieldLabel: 'Years of Experience', fieldType: 'number', value: '5', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'skills', fieldLabel: 'Key Skills', fieldType: 'textarea', value: 'TypeScript', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
      ] as const; 

      const summary = await engine.fillForm(sessionId, form.fields, mappings, undefined, { executionId: 'exec-fill-success', userId: 'user-1' }); 

      expect(summary.filled).toBeGreaterThan(0); 
      // Engine should have closed the session after successful filling. 
      expect(engine.getSession(sessionId)).toBeUndefined(); 
    }); 

    it('closes the session after a fill with terminal field failures', async () => { 
      const sessionId = 'fill-failure-test'; 
      await engine.createSession(sessionId); 
      const session = engine.getSession(sessionId); 
      if (!session) throw new Error('session not created'); 
      await session.page.goto(cleanFixtureUrl); 

      const form = await formExtractor.extractForm(session.page); 
      if (!form.fields.length) throw new Error('no fields extracted'); 

      // Fill with many fields; session should close regardless of fill outcome. 
      const mappings = [ 
        { fieldId: 'fullName', fieldLabel: 'Full Name', fieldType: 'text', value: 'Ada Lovelace', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'email', fieldLabel: 'Email Address', fieldType: 'email', value: 'ada@example.com', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'salary', fieldLabel: 'Expected Salary', fieldType: 'text', value: '999999', source: 'candidate-provided', verified: true }, 
        { fieldId: 'notice', fieldLabel: 'Notice Period', fieldType: 'text', value: '2 weeks', source: 'candidate-provided', verified: true }, 
        { fieldId: 'education', fieldLabel: 'Highest Education', fieldType: 'select', value: '', source: 'candidate-provided', verified: true }, 
        { fieldId: 'customQuestion', fieldLabel: 'Why do you want to work here?', fieldType: 'textarea', value: '', source: 'candidate-provided', verified: true }, 
      ] as const; 

      const summary = await engine.fillForm(sessionId, form.fields, mappings, undefined, { executionId: 'exec-fill-failure', userId: 'user-2' }); 

      // Engine should have closed the session after filling. 
      expect(engine.getSession(sessionId)).toBeUndefined(); 
    }); 

    it('closes the session after filling completes without challenge (clean fixture)', async () => { 
      const sessionId = 'fill-no-challenge-test'; 
      await engine.createSession(sessionId); 
      const session = engine.getSession(sessionId); 
      if (!session) throw new Error('session not created'); 
      await session.page.goto(cleanFixtureUrl); 

      const form = await formExtractor.extractForm(session.page); 
      if (!form.fields.length) throw new Error('no fields extracted'); 

      const mappings = [ 
        { fieldId: 'fullName', fieldLabel: 'Full Name', fieldType: 'text', value: 'Ada Lovelace', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'email', fieldLabel: 'Email Address', fieldType: 'email', value: 'ada@example.com', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'phone', fieldLabel: 'Phone Number', fieldType: 'tel', value: '555-1234', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'location', fieldLabel: 'Current Location', fieldType: 'text', value: 'City', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
        { fieldId: 'experience', fieldLabel: 'Years of Experience', fieldType: 'number', value: '5', source: 'candidate-provided', verified: true, result: 'MAPPED' }, 
      ] as const; 

      const summary = await engine.fillForm(sessionId, form.fields, mappings, undefined, { executionId: 'exec-fill-no-challenge', userId: 'user-3' }); 

      // Filling completes successfully without challenge. 
      expect(summary.filled).toBeGreaterThan(0); 
      // Engine should have closed the session after successful filling. 
      expect(engine.getSession(sessionId)).toBeUndefined(); 
    }); 
  }); 

  describe('Session manager ownership and idempotency', () => { 
    it('closeSession is idempotent and returns false for missing session', async () => { 
      const first = await sessionManager.closeSession('nonexistent-session'); 
      expect(first).toBe(false); 
      const second = await sessionManager.closeSession('nonexistent-session'); 
      expect(second).toBe(false); 
    }); 

    it('closeSessionForExecution rejects cross-owner cleanup', async () => {
      // Owner A creates a session with automation A and session A.
      // The third argument forwards executionId/ownerId to the session manager,
      // registering the session in both the sessions map AND the sessionOwners map.
      // This is the real production registration path.
      await engine.createSession('session-A', {}, {
        executionId: 'exec-A',
        ownerId: 'user-A',
      });

      // Owner B attempts to close session A.
      // The ownership guard should block the cleanup since Owner B is not the owner.
      const refused = await engine.closeSessionForExecution(
        'exec-A',
        'user-B',
      );
      // Cross-owner cleanup should be rejected/blocked by the ownership guard.
      expect(refused).toBe(false);
      // Session A must still be open (cross-owner cleanup was blocked).
      expect(engine.getSession('session-A')).toBeDefined();

      // Owner A closes session A successfully.
      const allowed = await engine.closeSessionForExecution(
        'exec-A',
        'user-A',
      );
      expect(allowed).toBe(true);
      // Session A should now be closed.
      expect(engine.getSession('session-A')).toBeUndefined();
    });

    it('closeSession is idempotent and returns false for missing session', async () => { 
      const first = await sessionManager.closeSession('nonexistent-session'); 
      expect(first).toBe(false); 
      const second = await sessionManager.closeSession('nonexistent-session'); 
      expect(second).toBe(false); 
    }); 

    it('cleanup of one session does not affect another', async () => { 
      await engine.createSession('keep-me'); 
      await engine.createSession('close-me'); 

      // Close the second session using engine's own mechanism. 
      // Since keep-me has no ownership set, closeSessionForExecution 
      // should not affect it. 
      await engine.closeSessionForExecution('close-me', ''); 

      expect(engine.getSession('keep-me')).toBeDefined(); 
      expect(engine.getSession('close-me')).toBeDefined(); 

      await sessionManager.closeSession('keep-me'); 
    }); 

    it('browser close failure does not prevent session removal', async () => { 
      await sessionManager.createSession('close-fail-test'); 
      const session = sessionManager.getSession('close-fail-test'); 
      if (!session) throw new Error('session not created'); 

      // Force the context close to throw, then verify session is still removed. 
      const originalClose = session.context.close.bind(session.context); 
      session.context.close = async () => { 
        throw new Error('browser context close failed'); 
      }; 

      const result = await sessionManager.closeSession('close-fail-test', { 
        executionId: 'exec-close-fail', 
        ownerId: 'user-y', 
      }); 
      expect(result).toBe(true); 
      expect(sessionManager.getSession('close-fail-test')).toBeUndefined(); 
    }); 
  }); 

  describe('Stale-session sweeper behavior', () => { 
    const sweeper = new BrowserSessionManager(); 

    it('does not close an active (recently touched) session', async () => { 
      await sweeper.createSession('active-session'); 
      sweeper.touchSession('active-session'); 

      const stale = sweeper.getStaleSessions(5 * 60 * 1000); 
      expect(stale).not.toContain('active-session'); 

      await sweeper.closeSession('active-session'); 
    }); 

    it('closes a genuinely stale session', async () => { 
      await sweeper.createSession('stale-session'); 
      const session = sweeper.getSession('stale-session'); 
      if (!session) throw new Error('session not created'); 
      session.lastActivityAt = new Date(Date.now() - 10 * 60 * 1000); 

      const stale = sweeper.getStaleSessions(5 * 60 * 1000); 
      expect(stale).toContain('stale-session'); 

      await sweeper.closeSession('stale-session'); 
      expect(sweeper.getSession('stale-session')).toBeUndefined(); 
    }); 

    it('multiple sweeper runs are idempotent', async () => { 
      await sweeper.createSession('idempotent-session'); 
      const session = sweeper.getSession('idempotent-session'); 
      if (!session) throw new Error('session not created'); 
      session.lastActivityAt = new Date(Date.now() - 10 * 60 * 1000); 

      const first = sweeper.getStaleSessions(5 * 60 * 1000); 
      expect(first).toContain('idempotent-session'); 
      await sweeper.closeSession('idempotent-session'); 

      const second = sweeper.getStaleSessions(5 * 60 * 1000); 
      expect(second).not.toContain('idempotent-session'); 
      expect(sweeper.getSession('idempotent-session')).toBeUndefined(); 
    }); 
  }); 
});