/**
 * Job discovery tests (Phases 2-7, 9).
 *
 * Network-free and deterministic: `fetch` is stubbed per-URL and sources are
 * driven through the real HttpJsonClient so cooldown/caching/concurrency are
 * exercised. Orchestration is tested with lightweight mock DiscoverySources.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HttpJsonClient } from '../src/jobs/discovery/http.js';
import { JobDiscoveryService } from '../src/jobs/discovery/JobDiscoveryService.js';
import { GreenhouseSource } from '../src/jobs/discovery/sources/CompanyBoardSource.js';
import { LeverSource } from '../src/jobs/discovery/sources/CompanyBoardSource.js';
import { AshbySource } from '../src/jobs/discovery/sources/CompanyBoardSource.js';
import { AdzunaSource } from '../src/jobs/discovery/sources/AdzunaSource.js';
import { RemotiveSource } from '../src/jobs/discovery/sources/RemotiveSource.js';
import { expandQueries } from '../src/jobs/discovery/queryExpansion.js';
import { dedupe, canonicalizeUrl } from '../src/jobs/discovery/dedupe.js';
import {
  classifyFreshness,
  passesFreshness,
  reliablePostedDate,
} from '../src/jobs/discovery/freshness.js';
import { resolveGeo } from '../src/jobs/discovery/geo.js';
import type { CompanyBoard } from '../src/jobs/discovery/registry.js';
import type { DiscoveredJob, DiscoverySource, SourceQueryResult } from '../src/jobs/discovery/types.js';

// ---- fetch stub infrastructure -------------------------------------------------

type Handler = (url: string) => { status?: number; body?: unknown; headers?: Record<string, string>; throwNetwork?: boolean };

let currentHandler: Handler | null = null;
let fetchCalls: string[] = [];
let inFlight = 0;
let maxInFlight = 0;

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function installFetch(delayMs = 0) {
  (globalThis as { fetch?: unknown }).fetch = async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input);
    fetchCalls.push(url);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (!currentHandler) return jsonRes(500, {});
      const h = currentHandler(url);
      if (h.throwNetwork) throw new Error('ENOTFOUND');
      return jsonRes(h.status ?? 200, h.body, h.headers);
    } finally {
      inFlight -= 1;
    }
  };
}

afterEach(() => {
  currentHandler = null;
  fetchCalls = [];
  inFlight = 0;
  maxInFlight = 0;
  vi.restoreAllMocks();
});

// ---- DiscoveredJob builder -----------------------------------------------------

let idCounter = 0;
function makeJob(over: Partial<DiscoveredJob> = {}): DiscoveredJob {
  idCounter += 1;
  const base: DiscoveredJob = {
    dedupeKey: `test:${idCounter}`,
    externalId: String(idCounter),
    canonicalUrl: `https://jobs.example.com/${idCounter}`,
    title: 'React Developer',
    companyName: 'Acme',
    remoteType: 'onsite',
    remoteEligibility: 'onsite',
    indiaEligible: false,
    sourceName: 'test',
    sourceProvider: 'testboard',
    sourceDisplayName: 'Test',
    discoveredViaQuery: 'React Developer',
    fetchedAt: new Date(),
    dateConfidence: 'reliable',
  };
  return { ...base, ...over };
}

// ================================================================================

describe('freshness', () => {
  it('classifies known dates: within 7 days, older than 30 days', () => {
    const now = Date.now();
    const fresh = new Date(now - 3 * 86400000);
    const older = new Date(now - 40 * 86400000);
    expect(classifyFreshness(fresh, now)).toMatchObject({ isNewWithin7: true, dateConfidence: 'reliable' });
    expect(classifyFreshness(older, now)).toMatchObject({ olderListing: true });
    expect(classifyFreshness(undefined)).toEqual({ dateConfidence: 'unavailable' });
  });

  it('rejects future and malformed dates defensively', () => {
    const now = Date.now();
    expect(reliablePostedDate(new Date(now + 5 * 86400000), now)).toBeUndefined();
    expect(reliablePostedDate('not-a-date', now)).toBeUndefined();
    expect(reliablePostedDate(null, now)).toBeUndefined();
  });

  it('passesFreshness keeps undated only for "any"', () => {
    const now = Date.now();
    const d = new Date(now - 5 * 86400000);
    expect(passesFreshness(undefined, 'any', now)).toBe(true);
    expect(passesFreshness(undefined, 'last7', now)).toBe(false);
    expect(passesFreshness(d, 'last7', now)).toBe(true);
    expect(passesFreshness(new Date(now - 20 * 86400000), 'last7', now)).toBe(false);
    expect(passesFreshness(new Date(now - 20 * 86400000), 'last30', now)).toBe(true);
  });
});

describe('dedupe', () => {
  it('removes duplicate internal ids and duplicate canonical urls', () => {
    const a = makeJob({ dedupeKey: 'gh:1', canonicalUrl: 'https://a.com/x' });
    const aDup = makeJob({ dedupeKey: 'gh:1', canonicalUrl: 'https://a.com/x' });
    const b = makeJob({ dedupeKey: 'lever:2', canonicalUrl: 'https://b.com/y' });
    const syndicated = makeJob({ dedupeKey: 'muse:3', canonicalUrl: 'https://a.com/x' });
    const { jobs, removedCount } = dedupe([a, aDup, b, syndicated]);
    expect(jobs).toHaveLength(2);
    expect(removedCount).toBe(2);
  });

  it('canonicalizes urls by stripping tracking params + protocol', () => {
    expect(canonicalizeUrl('http://a.com/jobs/x/?utm_source=x&gh_jid=123')).toBe('a.com/jobs/x');
  });
});

describe('geo', () => {
  it('detects India from ISO and from city text', () => {
    expect(resolveGeo({ countryIsoRaw: 'IN' }).indiaEligible).toBe(true);
    expect(resolveGeo({ locationText: 'Bengaluru, India' }).indiaEligible).toBe(true);
    expect(resolveGeo({ locationText: 'Noida' }).indiaEligible).toBe(true);
  });

  it('does NOT equate remote with India', () => {
    const r = resolveGeo({ locationText: 'Remote - US', remoteTypeRaw: 'remote' });
    expect(r.remoteType).toBe('remote');
    expect(r.indiaEligible).toBe(false);
  });

  it('treats worldwide remote as India-eligible and remote_worldwide', () => {
    const r = resolveGeo({ locationText: 'Remote - Worldwide', remoteTypeRaw: 'remote' });
    expect(r.remoteEligibility).toBe('remote_worldwide');
    expect(r.indiaEligible).toBe(true);
  });

  it('labels unknown remote eligibility honestly', () => {
    const r = resolveGeo({ locationText: 'Remote', remoteTypeRaw: 'remote' });
    expect(r.remoteEligibility).toBe('unknown');
  });
});

describe('query expansion', () => {
  it('expands a role into bounded, deduped, original-first related queries', () => {
    const q = expandQueries(['React Developer'], 6);
    expect(q[0]).toBe('React Developer');
    expect(q).toContain('Frontend Developer');
    expect(q.length).toBeLessThanOrEqual(6);
    expect(new Set(q).size).toBe(q.length);
  });

  it('keeps multiple user roles and bounds total', () => {
    const q = expandQueries(['React Developer', 'Backend Developer'], 4);
    expect(q[0]).toBe('React Developer');
    expect(q[1]).toBe('Backend Developer');
    expect(q.length).toBeLessThanOrEqual(4);
  });
});

// ---- HTTP client -------------------------------------------------------------

describe('HttpJsonClient', () => {
  it('honors 429 with a rate_limited result and a cooldown, then cools down', async () => {
    installFetch();
    let calls = 0;
    currentHandler = () => {
      calls += 1;
      return { status: 429, headers: { 'retry-after': '60' } };
    };
    const client = new HttpJsonClient({ maxRetries: 0 });
    const first = await client.getJson('https://api.example.test/x');
    expect(first.rateLimited).toBe(true);
    expect(client.cooldownRemainingMs('https://api.example.test/x')).toBeGreaterThan(0);
    const second = await client.getJson('https://api.example.test/x');
    expect(second.cooledDown).toBe(true);
    expect(calls).toBe(1); // not re-polled during cooldown
  });

  it('caches GET responses for the TTL', async () => {
    installFetch();
    let calls = 0;
    currentHandler = () => {
      calls += 1;
      return { body: { ok: true } };
    };
    const client = new HttpJsonClient({ cacheTtlMs: 60_000, maxRetries: 0 });
    await client.getJson('https://api.example.test/cache');
    await client.getJson('https://api.example.test/cache');
    expect(calls).toBe(1);
  });

  it('bounds concurrency', async () => {
    installFetch(10);
    currentHandler = () => ({ body: { ok: true } });
    const client = new HttpJsonClient({ concurrency: 2, cacheTtlMs: 0, maxRetries: 0 });
    await Promise.all([1, 2, 3, 4, 5].map((i) => client.getJson(`https://api.example.test/${i}`)));
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('treats a DNS/network failure as temporarily unavailable + sets a short cooldown', async () => {
    installFetch();
    currentHandler = () => ({ throwNetwork: true });
    const client = new HttpJsonClient({ maxRetries: 0, networkCooldownMs: 15000 });
    const r = await client.getJson('https://blocked.example.test/x');
    expect(r.ok).toBe(false);
    expect(client.cooldownRemainingMs('https://blocked.example.test/x')).toBeGreaterThan(0);
  });
});

// ---- Company board normalization ---------------------------------------------

const ghBoard: CompanyBoard = { company: 'Groww', provider: 'greenhouse', boardToken: 'groww', careerUrl: 'x', enabled: true };
const leverBoard: CompanyBoard = { company: 'Slice', provider: 'lever', boardToken: 'slice', careerUrl: 'x', enabled: true };
const ashbyBoard: CompanyBoard = { company: 'OpenAI', provider: 'ashby', boardToken: 'openai', careerUrl: 'x', enabled: true };

describe('GreenhouseSource', () => {
  it('normalizes and preserves posting vs update vs fetch dates + apply url', async () => {
    installFetch();
    currentHandler = () => ({
      body: {
        jobs: [
          {
            id: 42,
            title: 'Frontend Engineer',
            company_name: 'Groww',
            absolute_url: 'https://job-boards.greenhouse.io/groww/jobs/42',
            first_published: new Date(Date.now() - 5 * 86400000).toISOString(),
            updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            location: { name: 'Bengaluru, India' },
          },
        ],
      },
    });
    const src = new GreenhouseSource(ghBoard, { http: new HttpJsonClient({ maxRetries: 0 }), maxResultsPerBoard: 50 });
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('connected_with_results');
    const job = res.jobs[0];
    expect(job.companyName).toBe('Groww');
    expect(job.sourceName).toBe('greenhouse:groww');
    expect(job.sourceDisplayName).toBe('Groww (greenhouse)');
    expect(job.applicationUrl).toContain('job-boards.greenhouse.io/groww');
    expect(job.postedAt!.getTime()).not.toBe(job.updatedAt!.getTime());
    expect(job.fetchedAt).toBeInstanceOf(Date);
    expect(job.indiaEligible).toBe(true);
    expect(job.isNewWithin7).toBe(true);
  });

  it('maps a 404 board to not_configured (invalid identifier)', async () => {
    installFetch();
    currentHandler = () => ({ status: 404 });
    const src = new GreenhouseSource(ghBoard, { http: new HttpJsonClient({ maxRetries: 0 }), maxResultsPerBoard: 50 });
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('not_configured');
    expect(res.error).toMatch(/verify board identifier/);
  });
});

describe('LeverSource', () => {
  it('normalizes createdAt (+ preserves apply url, maps country)', async () => {
    installFetch();
    currentHandler = () => ({
      body: [
        {
          id: 'abc',
          text: 'Backend Engineer',
          createdAt: Date.now() - 10 * 86400000,
          hostedUrl: 'https://jobs.lever.co/slice/abc',
          applyUrl: 'https://jobs.lever.co/slice/abc/apply',
          categories: { location: 'Pune, India', allLocations: ['Pune, India'], commitment: 'Full-time' },
          workplaceType: 'onsite',
          country: 'IN',
          descriptionPlain: 'Build services',
        },
      ],
    });
    const src = new LeverSource(leverBoard, { http: new HttpJsonClient({ maxRetries: 0 }), maxResultsPerBoard: 50 });
    const res = await src.search(defaultInput(), ['Backend Developer']);
    const job = res.jobs[0];
    expect(job.sourceProvider).toBe('lever');
    expect(job.postedAt).toBeInstanceOf(Date);
    expect(job.applicationUrl).toBe('https://jobs.lever.co/slice/abc/apply');
    expect(job.indiaEligible).toBe(true);
    expect(job.employmentType).toBe('full_time');
  });
});

describe('AshbySource', () => {
  it('normalizes remote eligibility from secondary locations', async () => {
    installFetch();
    currentHandler = () => ({
      body: {
        jobs: [
          {
            id: 'ashby-1',
            title: 'ML Engineer',
            location: 'Remote - EU',
            isRemote: true,
            publishedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
            jobUrl: 'https://jobs.ashbyhq.com/openai/ashby-1',
            applyUrl: 'https://jobs.ashbyhq.com/openai/ashby-1/application',
            secondaryLocations: [{ location: 'France', address: { postalAddress: { addressCountry: 'France' } } }],
          },
        ],
      },
    });
    const src = new AshbySource(ashbyBoard, { http: new HttpJsonClient({ maxRetries: 0 }), maxResultsPerBoard: 50 });
    const res = await src.search(defaultInput(), ['Software Engineer']);
    const job = res.jobs[0];
    expect(job.remoteEligibility).toBe('remote_listed');
    expect(job.indiaEligible).toBe(false); // EU only
  });
});

// ---- Paginated aggregator (Adzuna) -------------------------------------------

const adzunaDeps = (over: Partial<{ maxPages: number; resultsPerPage: number }> = {}) => ({
  http: new HttpJsonClient({ maxRetries: 0, cacheTtlMs: 0 }),
  credentials: { appId: 'id', appKey: 'key', country: 'in' },
  maxPages: over.maxPages ?? 2,
  resultsPerPage: over.resultsPerPage ?? 2,
});

function defaultInput() {
  return {
    roles: ['React Developer'],
    countryIso: 'IN',
    includeRemote: true,
    includeWorldwideRemote: true,
    freshness: 'any' as const,
    sort: 'relevance' as const,
    pageSize: 20,
  };
}

describe('AdzunaSource', () => {
  it('reports not_configured without credentials', async () => {
    const src = new AdzunaSource({ http: new HttpJsonClient({ maxRetries: 0 }), maxPages: 2, resultsPerPage: 5 });
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('not_configured');
  });

  it('paginates multiple pages and reports real fetched counts (not the upstream total)', async () => {
    installFetch();
    const seen: string[] = [];
    currentHandler = (url) => {
      seen.push(url);
      const page = /\/search\/(\d+)/.exec(url)?.[1];
      if (page === '1') {
        return {
          body: {
            count: 500,
            results: [
              { id: 1, title: 'React Developer', company: { display_name: 'X' }, location: { display_name: 'Bengaluru' }, redirect_url: 'https://adz/u1', created: new Date().toISOString() },
              { id: 2, title: 'Frontend Developer', company: { display_name: 'Y' }, location: { display_name: 'Noida' }, redirect_url: 'https://adz/u2', created: new Date().toISOString() },
            ],
          },
        };
      }
      return {
        body: {
          count: 500,
          results: [
            { id: 3, title: 'React Native Developer', company: { display_name: 'Z' }, location: { display_name: 'Remote - India' }, redirect_url: 'https://adz/u3', created: new Date().toISOString() },
          ],
        },
      };
    };
    const src = new AdzunaSource(adzunaDeps({ maxPages: 2, resultsPerPage: 2 }));
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('connected_with_results');
    expect(res.pagesFetched).toBe(2);
    expect(res.fetchedCount).toBe(3); // actually fetched
    expect(res.upstreamTotal).toBe(500); // reported separately
    expect(seen.some((u) => u.includes('/search/1'))).toBe(true);
    expect(seen.some((u) => u.includes('/search/2'))).toBe(true);
    // Redacts credentials into the query but not logged anywhere: only urls built.
  });

  it('caps pages at maxPagesPerSource', async () => {
    installFetch();
    let count = 0;
    currentHandler = () => {
      count += 1;
      return { body: { count: 999, results: [{ id: count, title: 'React Developer', company: { display_name: 'X' }, location: { display_name: 'India' }, redirect_url: `https://adz/${count}`, created: new Date().toISOString() }] } };
    };
    const src = new AdzunaSource(adzunaDeps({ maxPages: 2, resultsPerPage: 1 }));
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.pagesFetched).toBeLessThanOrEqual(2);
  });

  it('builds a valid request: sanitized country, results_per_page clamped, keyword via what', async () => {
    installFetch();
    currentHandler = () => ({ body: { count: 0, results: [] } });
    const src = new AdzunaSource({
      http: new HttpJsonClient({ maxRetries: 0, cacheTtlMs: 0 }),
      credentials: { appId: 'id', appKey: 'key', country: 'India' }, // not a valid alpha-2 -> 'in'
      maxPages: 1,
      resultsPerPage: 100, // over Adzuna max -> clamped to 50
    });
    await src.search(defaultInput(), ['React Developer']);
    const url = fetchCalls[0];
    expect(url).toContain('/jobs/in/search/1');
    expect(url).toContain('results_per_page=50');
    expect(url).toContain('what=React');
    expect(url).not.toContain('what_or_category');
  });

  it('surfaces the provider 400 message without leaking credentials', async () => {
    installFetch();
    currentHandler = () => ({
      status: 400,
      body: { exception: 'MISSING_PARAM', display: 'results_per_page must be between 1 and 50' },
    });
    const src = new AdzunaSource({
      http: new HttpJsonClient({ maxRetries: 0, cacheTtlMs: 0 }),
      credentials: { appId: 'SECRETID123', appKey: 'SECRETKEY456', country: 'in' },
      maxPages: 1,
      resultsPerPage: 20,
    });
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('temporarily_unavailable');
    expect(res.error).toContain('HTTP 400');
    expect(res.error).toContain('results_per_page');
    expect(res.error).not.toContain('SECRETKEY456');
    expect(res.error).not.toContain('SECRETID123');
  });
});

// ---- Remotive (egress-limited here) -----------------------------------------

describe('RemotiveSource', () => {
  it('normalizes country eligibility from candidate_required_location', async () => {
    installFetch();
    currentHandler = () => ({
      body: {
        jobs: [
          { id: 'r1', url: 'https://remotive/r1', title: 'React Dev', company_name: 'WW', candidate_required_location: 'Worldwide', publication_date: new Date().toISOString() },
          { id: 'r2', url: 'https://remotive/r2', title: 'React Dev', company_name: 'US', candidate_required_location: 'USA', publication_date: new Date().toISOString() },
        ],
      },
    });
    const src = new RemotiveSource({ http: new HttpJsonClient({ maxRetries: 0 }), enabled: true, maxPages: 1, limit: 20 });
    const res = await src.search(defaultInput(), ['React Developer']);
    const worldwide = res.jobs.find((j) => j.externalId === 'r1')!;
    const us = res.jobs.find((j) => j.externalId === 'r2')!;
    expect(worldwide.indiaEligible).toBe(true);
    expect(worldwide.remoteEligibility).toBe('remote_worldwide');
    expect(us.indiaEligible).toBe(false);
  });

  it('does not re-poll while an upstream 429 cooldown is active', async () => {
    installFetch();
    let calls = 0;
    currentHandler = () => {
      calls += 1;
      return { status: 429, headers: { 'retry-after': '120' } };
    };
    const http = new HttpJsonClient({ maxRetries: 0 });
    const src = new RemotiveSource({ http, enabled: true, maxPages: 1, limit: 20 });
    const first = await src.search(defaultInput(), ['React Developer']);
    expect(first.state).toBe('rate_limited');
    const second = await src.search(defaultInput(), ['React Developer']);
    expect(second.state).toBe('rate_limited');
    expect(calls).toBe(1);
  });

  it('reports temporarily_unavailable when the host cannot be resolved', async () => {
    installFetch();
    currentHandler = () => ({ throwNetwork: true });
    const src = new RemotiveSource({ http: new HttpJsonClient({ maxRetries: 0, networkCooldownMs: 60000 }), enabled: true, maxPages: 1, limit: 20 });
    const res = await src.search(defaultInput(), ['React Developer']);
    expect(res.state).toBe('temporarily_unavailable');
  });
});

// ---- Service orchestration ----------------------------------------------------

function mockSource(spec: {
  name: string;
  provider: string;
  jobs?: DiscoveredJob[];
  throwErr?: boolean;
  configured?: boolean;
}): DiscoverySource {
  const configured = spec.configured ?? true;
  return {
    sourceName: spec.name,
    sourceProvider: spec.provider,
    displayName: `${spec.name} display`,
    isConfigured: () => configured,
    search: async (_input, _queries): Promise<SourceQueryResult> => {
      if (spec.throwErr) throw new Error('boom');
      const jobs = (spec.jobs ?? []).map((j) => ({
        ...j,
        sourceName: spec.name,
        sourceProvider: spec.provider,
        sourceDisplayName: `${spec.name} display`,
      }));
      return {
        sourceName: spec.name,
        sourceProvider: spec.provider,
        sourceDisplayName: `${spec.name} display`,
        state: 'connected_with_results',
        jobs,
        fetchedCount: jobs.length,
        pagesFetched: 1,
        fetchedAt: new Date(),
      };
    },
  };
}

describe('JobDiscoveryService', () => {
  it('keeps healthy-source results when one source fails', async () => {
    const good = mockSource({ name: 'gh:groww', provider: 'greenhouse', jobs: [makeJob({ indiaEligible: true, countryIso: 'IN', location: 'Bengaluru, India' })] });
    const bad = mockSource({ name: 'remotive', provider: 'remotive', throwErr: true });
    const svc = new JobDiscoveryService([good, bad], { resultCacheTtlMs: 0 });
    const res = await svc.discover(defaultInput());
    expect(res.totalUnique).toBeGreaterThanOrEqual(1);
    const st = Object.fromEntries(res.sources.map((s) => [s.sourceName, s.state]));
    expect(st['gh:groww']).toBe('connected_with_results');
    expect(st['remotive']).toBe('temporarily_unavailable');
  });

  it('dedupes across sources by canonical url', async () => {
    const shared = 'https://jobs.example.com/shared';
    const a = mockSource({ name: 'gh:a', provider: 'greenhouse', jobs: [makeJob({ dedupeKey: 'gh:a:1', canonicalUrl: shared, indiaEligible: true, countryIso: 'IN', title: 'React Developer' })] });
    const b = mockSource({ name: 'muse', provider: 'muse', jobs: [makeJob({ dedupeKey: 'muse:1', canonicalUrl: shared, indiaEligible: true, countryIso: 'IN', title: 'React Developer' })] });
    const svc = new JobDiscoveryService([a, b], { resultCacheTtlMs: 0 });
    const res = await svc.discover(defaultInput());
    expect(res.totalUnique).toBe(1);
    expect(res.excluded.duplicates).toBe(1);
  });

  it('excludes non-India onsite for an India search and counts geo exclusions', async () => {
    const us = mockSource({ name: 'gh:us', provider: 'greenhouse', jobs: [makeJob({ indiaEligible: false, countryIso: 'US', location: 'San Francisco', title: 'React Developer' })] });
    const svc = new JobDiscoveryService([us], { resultCacheTtlMs: 0 });
    const res = await svc.discover(defaultInput());
    expect(res.totalUnique).toBe(0);
    expect(res.excluded.geo).toBe(1);
  });

  it('filters by freshness and reports undated/older without dropping silently under "any"', async () => {
    const now = Date.now();
    const fresh = makeJob({ indiaEligible: true, countryIso: 'IN', postedAt: new Date(now - 2 * 86400000), title: 'React Developer' });
    const older = makeJob({ indiaEligible: true, countryIso: 'IN', postedAt: new Date(now - 45 * 86400000), title: 'React Developer' });
    const undated = makeJob({ indiaEligible: true, countryIso: 'IN', postedAt: undefined, title: 'React Developer' });
    const s = mockSource({ name: 'gh:x', provider: 'greenhouse', jobs: [fresh, older, undated] });
    const svc = new JobDiscoveryService([s], { resultCacheTtlMs: 0 });

    const any = await svc.discover({ ...defaultInput(), freshness: 'any' });
    expect(any.totalUnique).toBe(3);
    expect(any.within7Count).toBe(1);
    expect(any.olderCount).toBe(1);
    expect(any.undatedCount).toBe(1);

    const last7 = await svc.discover({ ...defaultInput(), freshness: 'last7' });
    expect(last7.totalUnique).toBe(1);
    expect(last7.excluded.freshness).toBe(2);
  });

  it('paginates the unique set and exposes hasMore', async () => {
    const many = Array.from({ length: 25 }, (_, i) => makeJob({ indiaEligible: true, countryIso: 'IN', dedupeKey: `gh:x:${i}`, canonicalUrl: `https://a/${i}`, title: 'React Developer' }));
    const s = mockSource({ name: 'gh:x', provider: 'greenhouse', jobs: many });
    const svc = new JobDiscoveryService([s], { resultCacheTtlMs: 0 });
    const page1 = await svc.discover({ ...defaultInput(), page: 1, pageSize: 10 });
    const page2 = await svc.discover({ ...defaultInput(), page: 2, pageSize: 10 });
    expect(page1.jobs).toHaveLength(10);
    expect(page1.hasMore).toBe(true);
    expect(page2.jobs).toHaveLength(10);
    expect(page2.totalPages).toBe(3);
  });

  it('sorts newest independently of relevance', async () => {
    const now = Date.now();
    const highRelOld = makeJob({ indiaEligible: true, countryIso: 'IN', postedAt: new Date(now - 30 * 86400000), title: 'Senior React Developer Frontend', dedupeKey: 'a', canonicalUrl: 'https://a/1' });
    const lowRelNew = makeJob({ indiaEligible: true, countryIso: 'IN', postedAt: new Date(now - 1 * 86400000), title: 'Developer', dedupeKey: 'b', canonicalUrl: 'https://b/1' });
    const s = mockSource({ name: 'gh:x', provider: 'greenhouse', jobs: [highRelOld, lowRelNew] });
    const svc = new JobDiscoveryService([s], { resultCacheTtlMs: 0 });
    const relOrder = (await svc.discover({ ...defaultInput(), sort: 'relevance' })).jobs.map((j) => j.dedupeKey);
    expect(relOrder[0]).toBe('a'); // title relevance wins
    const newOrder = (await svc.discover({ ...defaultInput(), sort: 'newest' })).jobs.map((j) => j.dedupeKey);
    expect(newOrder[0]).toBe('b'); // freshness wins
  });

  it('reconciles a source that returned rows but none survived to connected_no_matches', async () => {
    const irrelevant = mockSource({ name: 'gh:noise', provider: 'greenhouse', jobs: [makeJob({ indiaEligible: false, countryIso: 'US', title: 'Chef' })] });
    const svc = new JobDiscoveryService([irrelevant], { resultCacheTtlMs: 0 });
    const res = await svc.discover(defaultInput());
    expect(res.sources[0].state).toBe('connected_no_matches');
  });

  it('marks unconfigured sources without removing others', async () => {
    const adzuna = mockSource({ name: 'adzuna', provider: 'adzuna', configured: false });
    const good = mockSource({ name: 'gh:groww', provider: 'greenhouse', jobs: [makeJob({ indiaEligible: true, countryIso: 'IN', location: 'Bengaluru', title: 'React Developer' })] });
    const svc = new JobDiscoveryService([adzuna, good], { resultCacheTtlMs: 0 });
    const res = await svc.discover(defaultInput());
    const st = Object.fromEntries(res.sources.map((s) => [s.sourceName, s.state]));
    expect(st['adzuna']).toBe('not_configured');
    expect(st['gh:groww']).toBe('connected_with_results');
    expect(res.totalUnique).toBe(1);
  });
});
