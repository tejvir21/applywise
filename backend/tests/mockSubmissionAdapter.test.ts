import { describe, it, expect } from 'vitest';
import { MockSubmissionAdapter } from '../src/platforms/MockSubmissionAdapter.js';
import { submissionRegistry } from '../src/platforms/SubmissionAdapter.js';

describe('MockSubmissionAdapter', () => {
  it('success', async () => {
    const a = new MockSubmissionAdapter('success');
    const r = await a.submit({ applicationId: '1', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k' });
    expect(r.mock).toBe(true);
    expect(r.outcome).toBe('submitted');
  });
  it('failure', async () => {
    const a = new MockSubmissionAdapter('failure');
    const r = await a.submit({ applicationId: '1', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k' });
    expect(r.outcome).toBe('failed');
  });
  it('uncertain', async () => {
    const a = new MockSubmissionAdapter('uncertain');
    const r = await a.submit({ applicationId: '1', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k' });
    expect(r.outcome).toBe('manual_required');
  });
  it('registry', () => {
    const a = new MockSubmissionAdapter('success');
    if (!submissionRegistry.get('mock')) submissionRegistry.register(a);
    expect(submissionRegistry.get('mock')).toBeDefined();
  });
});
