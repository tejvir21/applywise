/** Duplicate detection service tests (Phase 8.3.7). */

import { describe, it, expect } from 'vitest';
import {
  findDuplicate,
  candidateFromJob,
  canonicalizeUrl,
  type DuplicateDetectionInput,
} from '../src/services/DuplicateDetectionService.js';

function job(overrides: Record<string, unknown> = {}): any {
  return {
    _id: 'existing-id',
    title: 'Senior Software Engineer',
    companyName: 'TechCorp',
    location: 'San Francisco, CA',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    sources: [],
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}): DuplicateDetectionInput {
  return {
    source: 'linkedin',
    sourceJobId: 'ext-123',
    applicationUrl: 'https://linkedin.com/jobs/view/ext-123',
    title: 'Senior Software Engineer',
    companyName: 'TechCorp',
    location: 'San Francisco, CA',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    ...overrides,
  };
}

describe('canonicalizeUrl', () => {
  it('normalizes https, drops fragment and tracking params', () => {
    expect(canonicalizeUrl('https://LinkedIn.com/jobs/view/123?utm_source=email#section')).toBe(
      'linkedin.com/jobs/view/123',
    );
  });
  it('removes trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/jobs/123/')).toBe('example.com/jobs/123');
  });
  it('preserves meaningful query parameters', () => {
    expect(canonicalizeUrl('https://example.com/apply?id=987')).toBe('example.com/apply?id=987');
  });
});

describe('candidateFromJob', () => {
  it('extracts source and sourceJobId from first source entry', () => {
    const c = candidateFromJob({
      title: 'Dev',
      companyName: 'Acme',
      sources: [{ name: 'Indeed', sourceJobId: 'j1', sourceUrl: 'https://indeed.com/view/j1' }],
    });
    expect(c.source).toBe('Indeed');
    expect(c.sourceJobId).toBe('j1');
    expect(c.applicationUrl).toBe('https://indeed.com/view/j1');
  });
});

describe('findDuplicate', () => {
  it('exact same source + sourceJobId is a duplicate', async () => {
    const existing = [job({ sources: [{ name: 'linkedin', sourceJobId: 'ext-123' }] })];
    const res = await findDuplicate(candidate(), existing);
    expect(res.isDuplicate).toBe(true);
    expect(res.match!.kind).toBe('EXACT_SOURCE_ID');
    expect(res.match!.existingJobId).toBe('existing-id');
  });

  it('same source id but different platform is not a duplicate', async () => {
    const existing = [job({ sources: [{ name: 'indeed', sourceJobId: 'ext-123' }], title: 'Data Scientist', companyName: 'DataCo', location: 'Austin, TX' })];
    const res = await findDuplicate(candidate(), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('same canonical URL with different tracking params is a duplicate', async () => {
    const existing = [job({ sources: [{ name: 'lever', sourceJobId: 'other', sourceUrl: 'https://lever.co/apply/1' }] })];
    const c = candidate({ source: 'lever', sourceJobId: 'other2', applicationUrl: 'https://LEVER.CO/apply/1?utm_campaign=x' });
    const res = await findDuplicate(c, existing);
    expect(res.isDuplicate).toBe(true);
    expect(res.match!.kind).toBe('CANONICAL_URL');
  });

  it('different platforms with identical source IDs are not duplicates', async () => {
    const existing = [job({ sources: [{ name: 'linkedin', sourceJobId: 'ext-123' }], title: 'Data Scientist', companyName: 'DataCo', location: 'Austin, TX' })];
    const res = await findDuplicate(candidate({ source: 'indeed', sourceJobId: 'ext-123' }), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('same title but different company is not a duplicate', async () => {
    const existing = [job({ companyName: 'Other Corp' })];
    const res = await findDuplicate(candidate(), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('same company and title but different location is not a duplicate', async () => {
    const existing = [job({ location: 'New York, NY' })];
    const res = await findDuplicate(candidate(), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('high-confidence similarity marks duplicate', async () => {
    const existing = [job({ title: 'Senior Software Engineer', companyName: 'TechCorp', location: 'San Francisco, CA' })];
    const res = await findDuplicate(candidate({ source: 'other', sourceJobId: 'diff' }), existing);
    expect(res.isDuplicate).toBe(true);
    expect(res.match!.kind).toBe('HIGH_CONFIDENCE_SIMILARITY');
  });

  it('missing source job ID does not crash', async () => {
    const existing = [job({ title: 'Data Scientist', companyName: 'DataCo', location: 'Austin, TX', sources: [] })];
    const res = await findDuplicate(candidate({ source: undefined, sourceJobId: undefined, applicationUrl: undefined }), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('missing application URL does not crash', async () => {
    const existing = [job({ title: 'Data Scientist', companyName: 'DataCo', location: 'Austin, TX', sources: [] })];
    const res = await findDuplicate(candidate({ applicationUrl: undefined }), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('similar titles representing distinct openings are not duplicates', async () => {
    const existing = [job({ title: 'Senior Software Engineer - Backend', companyName: 'TechCorp', location: 'San Francisco, CA' })];
    const res = await findDuplicate(candidate({ title: 'Senior Frontend Engineer', companyName: 'TechCorp', location: 'San Francisco, CA' }), existing);
    expect(res.isDuplicate).toBe(false);
  });

  it('jobs with incomplete metadata are handled', async () => {
    const existing = [job({ title: '', companyName: '', location: undefined })];
    const res = await findDuplicate(candidate({ title: '', companyName: '', location: undefined }), existing);
    expect(res.isDuplicate).toBe(false);
  });
});
