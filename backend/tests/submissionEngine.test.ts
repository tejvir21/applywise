import { describe, it, expect } from 'vitest';
import { SubmissionEngine } from '../src/services/SubmissionEngine.js';

describe('SubmissionEngine skeleton', () => {
  it('constructs', () => {
    expect(new SubmissionEngine()).toBeDefined();
  });
  it('missing fields throws', async () => {
    const e = new SubmissionEngine();
    await expect(e.execute({ userId: '', applicationId: 'a', platform: 'p', idempotencyKey: 'k' })).rejects.toThrow();
  });
});
