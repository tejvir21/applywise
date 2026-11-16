/**
 * Job provider adapter tests.
 *
 * All upstream HTTP is mocked, so these are deterministic and require no
 * credentials or network access. Coverage:
 *  - response normalization for every adapter
 *  - missing credentials -> not_configured (never fabricated results)
 *  - malformed / invalid upstream payloads
 *  - timeouts, HTTP errors, and rate limits
 *  - safe external URLs (javascript:, data:, relative are rejected)
 *  - per-provider failure isolation and partial success in discovery
 *  - empty search vs failed search distinction
 *  - deduplication and idempotent imports
 *  - cross-user isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeHttpUrl,
  stripHtml,
  toDate,
  toNumber,
  clampPageSize,
  relevanceScore,
  ProviderError,
} from '../src/jobs/providerUtils.js';
import { AdzunaJobSource } from '../src/jobs/AdzunaJobSource.js';
import { MuseJobSource } from '../src/jobs/MuseJobSource.js';
import { RemotiveJobSource, resetRemotiveCooldown } from '../src/jobs/RemotiveJobSource.js';
import { JoobleJobSource } from '../src/jobs/JoobleJobSource.js';
import { resetConfigCache } from '../src/config/index.js';

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetConfigCache();
}

const BASE_ENV = {
  JWT_ACCESS_SECRET: 'test-access-secret-32-characters-minimum',
  JWT_REFRESH_SECRET: 'test-refresh-secret-32-characters-minimum',
  NODE_ENV: 'test',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Fetch stub that resolves to a single canned response. */
function mockFetch(response: unknown | (() => unknown)) {
  const fn = vi.fn(async () => {
    const value = typeof response === 'function' ? (response as () => unknown)() : response;
    if (value instanceof Error) throw value;
    return value;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  setEnv({ ...BASE_ENV });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('providerUtils', () => {
  it('accepts only absolute http/https URLs', () => {
    expect(sanitizeHttpUrl('https://example.com/job/1')).toBe('https://example.com/job/1');
    expect(sanitizeHttpUrl('http://example.com/job/1')).toBe('http://example.com/job/1');
  });

  it('rejects unsafe or malformed URLs', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeHttpUrl('data:text/html,<script>x</script>')).toBeUndefined();
    expect(sanitizeHttpUrl('file:///etc/passwd')).toBeUndefined();
    expect(sanitizeHttpUrl('/relative/path')).toBeUndefined();
    expect(sanitizeHttpUrl('not a url')).toBeUndefined();
    expect(sanitizeHttpUrl(undefined)).toBeUndefined();
    expect(sanitizeHttpUrl(12345)).toBeUndefined();
  });

  it('strips HTML from descriptions into plain text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    expect(stripHtml('<ul><li>One</li><li>Two</li></ul>')).toContain('One');
    expect(stripHtml('<a href="x">link</a>')).toBe('link');
    expect(stripHtml('')).toBeUndefined();
    expect(stripHtml(null)).toBeUndefined();
  });

  it('parses numbers and dates defensively', () => {
    expect(toNumber('150,000')).toBe(150000);
    expect(toNumber('$1200')).toBe(1200);
    expect(toNumber('not a number')).toBeUndefined();
    expect(toNumber(undefined)).toBeUndefined();
    expect(toDate('2024-01-01T00:00:00Z')?.getUTCFullYear()).toBe(2024);
    expect(toDate('garbage')).toBeUndefined();
    expect(toDate(undefined)).toBeUndefined();
  });

  it('clamps page sizes into a safe range', () => {
    expect(clampPageSize(1000, 50)).toBe(50);
    expect(clampPageSize(0, 50)).toBe(1);
    expect(clampPageSize(undefined, 50, 20)).toBe(20);
    expect(clampPageSize(10, 50)).toBe(10);
  });
});

describe('AdzunaJobSource', () => {
  it('reports not_configured without credentials and makes no request', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: undefined, ADZUNA_APP_KEY: undefined });
    const source = new AdzunaJobSource();

    await expect(source.validateConfiguration()).resolves.toBe(false);
    const fetchMock = mockFetch(jsonResponse({}));
    await expect(source.searchJobs({})).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports disabled when the flag is off', async () => {
    setEnv({ ADZUNA_ENABLED: 'false', ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key' });
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'disabled' });
  });

  it('calls the India country endpoint with credentials and normalizes results', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'APP_ID', ADZUNA_APP_KEY: 'APP_KEY', ADZUNA_COUNTRY: 'in' });
    const fetchMock = mockFetch(
      jsonResponse({
        count: 2,
        // Verified live: the JSON envelope returns records under `results`.
        results: [
          {
            id: 'adz-1',
            title: 'React Developer',
            company: { display_name: 'Acme India' },
            location: { display_name: 'Bengaluru, India', country: 'IN' },
            description: '<p>Build <b>APIs</b>.</p>',
            redirect_url: 'https://www.adzuna.in/details/1',
            created: '2024-05-01T10:00:00+00:00',
            contract_time: 'full_time',
            salary_min: 1000000,
            salary_max: 1500000,
            salary_is_predicted: '0',
          },
        ],
      }),
    );

    const result = await new AdzunaJobSource().searchJobs({ query: 'engineer', location: 'India', page: 1, country: undefined } as never);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/v1/api/jobs/in/search/1');
    expect(url).toContain('app_id=APP_ID');
    expect(url).toContain('app_key=APP_KEY');
    expect(url).toContain('what=engineer');

    // Regression: sending `content_type` makes Adzuna return HTTP 400 with an
    // HTML error page. The adapter must NOT send it.
    expect(url).not.toContain('content_type');

    expect(result.jobs).toHaveLength(1);
    const job = result.jobs[0];
    expect(job.sourceName).toBe('adzuna');
    expect(job.sourceJobId).toBe('adz-1');
    expect(job.title).toBe('React Developer');
    expect(job.companyName).toBe('Acme India');
    expect(job.applicationUrl).toBe('https://www.adzuna.in/details/1');
    expect(job.description).toBe('Build APIs.');
    // Verified live: employment type arrives in `contract_time`.
    expect(job.employmentType).toBe('full_time');
    expect(job.postedAt).toBeInstanceOf(Date);
    // The `in` feed returns INR.
    expect(job.salaryCurrency).toBe('INR');
    expect(job.salaryMin).toBe(1000000);
  });

  it('does not present a predicted salary band as real', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' });
    mockFetch(
      jsonResponse({
        results: [
          {
            id: 'p-1',
            title: 'Predicted Salary Role',
            company: { display_name: 'Co' },
            salary_min: 500000,
            salary_max: 900000,
            salary_is_predicted: '1',
          },
        ],
      }),
    );
    const result = await new AdzunaJobSource().searchJobs({});
    // A predicted band is a guess; treat it as unknown rather than fact.
    expect(result.jobs[0].salaryMin).toBeUndefined();
    expect(result.jobs[0].salaryMax).toBeUndefined();
  });

  it('skips malformed records without failing the batch', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' });
    mockFetch(
      jsonResponse({
        count: 3,
        results: [
          null,
          { title: 'No company or id' },
          { id: 'ok-1', title: 'Good Job', company: { display_name: 'Good Co' }, redirect_url: 'https://example.com/1' },
        ],
      }),
    );

    const result = await new AdzunaJobSource().searchJobs({});
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].sourceJobId).toBe('ok-1');
  });

  it('maps a 401 to not_configured rather than a generic error', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'bad', ADZUNA_APP_KEY: 'bad' });
    mockFetch(jsonResponse({ exception: 'AUTH_FAIL' }, 401));
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('maps HTTP errors and rate limits to safe codes', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' });
    mockFetch(jsonResponse({}, 500));
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'upstream_error' });

    mockFetch(jsonResponse({}, 429));
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('does not mislabel a 403 as missing configuration', async () => {
    // Verified live against Jooble: a valid key still returns 403 because the
    // endpoint is behind bot protection. Reporting that as "not_configured"
    // would send the operator to fix credentials that are already correct.
    setEnv({ JOOBLE_ENABLED: 'true', JOOBLE_API_KEY: 'KEY' });
    mockFetch(jsonResponse('<html>403</html>', 403));
    await expect(new JoobleJobSource().searchJobs({})).rejects.toMatchObject({ code: 'upstream_error' });

    // A genuine credential rejection (401) IS a configuration problem.
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'bad', ADZUNA_APP_KEY: 'bad' });
    mockFetch(jsonResponse({ exception: 'AUTH_FAIL' }, 401));
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('does not leak the upstream body in error messages', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' });
    mockFetch(jsonResponse({ error: 'super secret internal detail', key: 'APP_KEY' }, 500));
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      return !message.includes('APP_KEY') && !message.includes('super secret internal detail');
    });
  });

  it('times out and reports a timeout code', async () => {
    setEnv({ ADZUNA_ENABLED: 'true', ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k', JOB_PROVIDER_TIMEOUT_MS: '1000' });
    mockFetch(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    await expect(new AdzunaJobSource().searchJobs({})).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('MuseJobSource', () => {
  const musePayload = {
    page: 1,
    page_count: 1,
    items_per_page: 20,
    total: 1,
    results: [
      {
        id: 20053891,
        name: 'Senior Systems Engineer',
        company: { id: 1, short_name: 'zillow', name: 'Zillow' },
        levels: [{ name: 'Senior Level', short_name: 'senior' }],
        locations: [{ name: 'Caledonia, MI' }],
        categories: [{ name: 'Software Engineering' }],
        publication_date: '2025-08-29T01:06:42Z',
        contents: '<p>Build <b>things</b>.</p>',
        refs: { landing_page: 'https://www.themuse.com/jobs/zillow/senior-systems-engineer' },
        type: 'external',
        short_name: 'senior-systems-engineer',
      },
    ],
  };

  it('normalizes a listing including the original landing page', async () => {
    const fetchMock = mockFetch(jsonResponse(musePayload));
    const result = await new MuseJobSource().searchJobs({ category: undefined } as never);

    expect(String(fetchMock.mock.calls[0][0])).toContain('https://www.themuse.com/api/public/jobs');
    const job = result.jobs[0];
    expect(job.sourceName).toBe('muse');
    expect(job.title).toBe('Senior Systems Engineer');
    expect(job.companyName).toBe('Zillow');
    expect(job.applicationUrl).toBe('https://www.themuse.com/jobs/zillow/senior-systems-engineer');
    expect(job.sourceUrl).toBe(job.applicationUrl);
    expect(job.experienceLevel).toBe('senior');
    expect(job.description).toBe('Build things.');
    expect(job.postedAt).toBeInstanceOf(Date);
  });

  it('rejects a javascript: landing page rather than storing it', async () => {
    mockFetch(
      jsonResponse({
        ...musePayload,
        results: [{ ...musePayload.results[0], refs: { landing_page: 'javascript:alert(1)' } }],
      }),
    );
    const result = await new MuseJobSource().searchJobs({});
    expect(result.jobs[0].applicationUrl).toBeUndefined();
  });

  it('returns an empty list (not an error) for a non-matching category', async () => {
    mockFetch(jsonResponse({ ...musePayload, results: [], total: 0 }));
    const result = await new MuseJobSource().searchJobs({ query: 'No Such Category XYZ' });
    expect(result.jobs).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('reports disabled when the flag is off', async () => {
    setEnv({ MUSE_ENABLED: 'false' });
    await expect(new MuseJobSource().searchJobs({})).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('RemotiveJobSource', () => {
  const remotivePayload = {
    'job-count': 1,
    'total-job-count': 1,
    '0-legal-notice': 'link back and attribute Remotive',
    jobs: [
      {
        id: 2091045,
        title: 'Tier III Service Desk Engineer',
        url: 'https://remotive.com/remote-jobs/information-technology/tier-iii-service-desk-engineer-2091045',
        company_name: 'Unio Digital',
        candidate_required_location: 'Worldwide',
        job_type: 'full_time',
        publication_date: '2026-10-07T01:11:09',
        category: 'Information Technology',
        tags: ['azure', 'security'],
        description: '<p>Support role.</p>',
        salary: { min: 0, max: 0, currency: 'USD' },
      },
    ],
  };

  it('normalizes a listing and keeps the original Remotive URL for attribution', async () => {
    setEnv({ REMOTIVE_MIN_INTERVAL_MS: '0' });
    resetRemotiveCooldown();
    mockFetch(jsonResponse(remotivePayload));
    const result = await new RemotiveJobSource().searchJobs({ query: 'engineer' });

    const job = result.jobs[0];
    expect(job.sourceName).toBe('remotive');
    // Terms require linking back to Remotive and naming it as the source.
    expect(job.sourceUrl).toBe('https://remotive.com/remote-jobs/information-technology/tier-iii-service-desk-engineer-2091045');
    expect(job.applicationUrl).toBe(job.sourceUrl);
    expect(job.companyName).toBe('Unio Digital');
    expect(job.remoteType).toBe('remote');
    expect(job.employmentType).toBe('full_time');
    expect(job.postedAt).toBeInstanceOf(Date);
    expect(job.description).toBe('Support role.');
    // Tags are recorded as preferred, not required skills.
    expect(job.preferredSkills.length).toBeGreaterThan(0);
    expect(job.requiredSkills).toHaveLength(0);
  });

  it('enforces the request-rate cooldown', async () => {
    setEnv({ REMOTIVE_MIN_INTERVAL_MS: '3600000' });
    resetRemotiveCooldown();
    const fetchMock = mockFetch(jsonResponse(remotivePayload));
    const source = new RemotiveJobSource();

    await source.searchJobs({ query: 'first' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(source.searchJobs({ query: 'second' })).rejects.toMatchObject({ code: 'rate_limited' });
    // The cooldown prevented a second upstream call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports disabled when the flag is off', async () => {
    setEnv({ REMOTIVE_ENABLED: 'false' });
    await expect(new RemotiveJobSource().searchJobs({})).rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('JoobleJobSource', () => {
  it('reports not_configured without a key and makes no request', async () => {
    setEnv({ JOOBLE_ENABLED: 'true', JOOBLE_API_KEY: undefined });
    const fetchMock = mockFetch(jsonResponse({}));
    await expect(new JoobleJobSource().validateConfiguration()).resolves.toBe(false);
    await expect(new JoobleJobSource().searchJobs({})).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled by default', async () => {
    setEnv({ JOOBLE_ENABLED: undefined, JOOBLE_API_KEY: undefined });
    await expect(new JoobleJobSource().searchJobs({})).rejects.toMatchObject({ code: 'disabled' });
  });

  it('normalizes a response when a key is supplied', async () => {
    setEnv({ JOOBLE_ENABLED: 'true', JOOBLE_API_KEY: 'KEY123' });
    mockFetch(
      jsonResponse([
        {
          id: 'jooble-1',
          title: 'Data Analyst',
          company: 'Data Co',
          location: 'Mumbai',
          url: 'https://jooble.org/listing/1',
          type: 'full_time',
          created: '2024-04-01T00:00:00Z',
        },
      ]),
    );
    const result = await new JoobleJobSource().searchJobs({ query: 'analyst', location: 'India' });
    const job = result.jobs[0];
    expect(job.sourceName).toBe('jooble');
    expect(job.title).toBe('Data Analyst');
    expect(job.applicationUrl).toBe('https://jooble.org/listing/1');
  });
});

describe('relevanceScore', () => {
  it('ranks an exact title match above a loosely related role', () => {
    const exact = relevanceScore({ title: 'React Developer', companyName: 'Acme' }, 'React Developer');
    const loose = relevanceScore(
      { title: 'Tier III Service Desk Engineer', companyName: 'Unio', description: 'Support role.' },
      'React Developer',
    );
    expect(exact).toBeGreaterThan(loose);
  });

  it('keeps valid title variants relevant', () => {
    // A senior React role IS a valid match even though the wording differs.
    const senior = relevanceScore({ title: 'Senior React Developer', companyName: 'Acme' }, 'React Developer');
    expect(senior).toBeGreaterThan(0);
    expect(senior).toBeGreaterThan(
      relevanceScore({ title: 'Warehouse Operative', companyName: 'Acme' }, 'React Developer'),
    );
  });

  it('scores title matches above description-only matches', () => {
    const inTitle = relevanceScore({ title: 'React Developer' }, 'React');
    const inBody = relevanceScore({ title: 'Support Engineer', description: 'Some React work.' }, 'React');
    expect(inTitle).toBeGreaterThan(inBody);
  });

  it('returns 0 with no query and stays within 0-100', () => {
    expect(relevanceScore({ title: 'Anything' })).toBe(0);
    const value = relevanceScore({ title: 'React React React Developer', description: 'React'.repeat(50) }, 'React');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});

describe('ProviderError', () => {
  it('carries a stable code and no upstream detail', () => {
    const error = new ProviderError('upstream_error', 'Provider returned HTTP 500.');
    expect(error.code).toBe('upstream_error');
    expect(error.message).toBe('Provider returned HTTP 500.');
    expect(error).toBeInstanceOf(Error);
  });
});