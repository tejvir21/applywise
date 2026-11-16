import { describe, it, expect } from 'vitest';
import { submissionRegistry } from '../src/platforms/SubmissionAdapter.js';

describe('submission orchestrator smoke', () => {
  it('has no registered adapters by default', () => {
    expect(submissionRegistry.get('linkedin')).toBeUndefined();
  });
});
