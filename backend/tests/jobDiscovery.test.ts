/**
 * Job discovery + import integration tests (fictional data, in-memory DB).
 *
 * Covers the multi-source guarantees the UI depends on:
 *  - one provider failing does not block healthy providers (partial success)
 *  - empty results are distinguished from failed searches
 *  - unconfigured providers are reported, never faked
 *  - imports are idempotent and deduplicated
 *  - imported jobs enter the EXISTING matching workflow unchanged
 *  - cross-user isolation for imported jobs
 *  - matching still distinguishes insufficient data from a low match
 *
 * Upstream HTTP is mocked so the suite is deterministic and needs no keys.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  connectToDatabase,
  disconnectDatabase,
  isDatabaseConnected,
} from '../src/config/database.js';
import { resetConfigCache } from '../src/config/index.js';
import { JobModel, SavedJobModel, CandidateProfileModel, UserModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_ACCESS_SECRET = 'disc-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'disc-refresh-secret-at-least-32-characters';

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetConfigCache();
}

const BASE_ENV = {
  MUSE_ENABLED: 'true',
  ADZUNA_ENABLED: 'true',
  JOOBLE_ENABLED: 'false',
  REMOTIVE_ENABLED: 'false',
  ADZUNA_APP_ID: undefined,
  ADZUNA_APP_KEY: undefined,
  JOOBLE_API_KEY: undefined,
  REMOTIVE_MIN_INTERVAL_MS: '0',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('Job discovery + import (fictional data)', () => {
  const app = createApp();
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    // Uses the shared in-memory MongoDB started by tests/setup.ts. Each test
    // clears the tables it touches, so this suite stays isolated from others.
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await Promise.all([
        JobModel.deleteMany({}).exec(),
        SavedJobModel.deleteMany({}).exec(),
        CandidateProfileModel.deleteMany({}).exec(),
        UserModel.deleteMany({}).exec(),
        ApplicationModel.deleteMany({}).exec(),
        ApplicationEventModel.deleteMany({}).exec(),
      ]);
    }
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  beforeEach(async () => {
    vi.unstubAllGlobals();
    setEnv(BASE_ENV);
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function register(email: string) {
    const res = await request(app).post('/api/auth/register').send({ email, password: 'password123' }).expect(201);
    return res.body.data.access_token as string;
  }

  async function createProfile(accessToken: string) {
    await request(app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Rowan',
        lastName: 'Fictional',
        skills: [{ name: 'TypeScript' }, { name: 'React' }],
        yearsOfExperience: 6,
        currentJobTitle: 'Senior Software Engineer',
        jobPreferences: {
          desiredRoles: ['Software Engineer'],
          workMode: ['remote', 'hybrid'],
          employmentTypes: ['full_time'],
        },
      })
      .expect(201);
  }

  it('lists provider status without exposing credentials', async () => {
    setEnv({ ADZUNA_APP_ID: 'SECRET_ID', ADZUNA_APP_KEY: 'SECRET_KEY' });
    resetConfigCache();
    token = await register(`sources-${Date.now()}@test.com`);

    const res = await request(app)
      .get('/api/jobs/sources')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET_ID');
    expect(body).not.toContain('SECRET_KEY');

    const muse = res.body.data.sources.find((s: { source: string }) => s.source === 'muse');
    expect(muse.status).toBe('ok');
    const remotive = res.body.data.sources.find((s: { source: string }) => s.source === 'remotive');
    expect(remotive.status).toBe('disabled');
    // Import-only helpers (manual/mock) are not live providers.
    expect(res.body.data.sources.find((s: { source: string }) => s.source === 'mock')).toBeUndefined();
  });

  it('searches providers and returns partial results when one fails', async () => {
    token = await register(`partial-${Date.now()}@test.com`);
    await createProfile(token);

    // Configure Adzuna so it is actually queried (and then fails), which is
    // what makes the result "partial" rather than merely "some sources skipped".
    setEnv({ ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'key', ADZUNA_ENABLED: 'true' });

    // Muse succeeds; Adzuna fails with a 500.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('themuse.com')) {
          return jsonResponse({
            results: [
              {
                id: 1,
                name: 'Frontend Engineer',
                company: { name: 'Fictional Co' },
                levels: [{ short_name: 'mid' }],
                locations: [{ name: 'Remote' }],
                publication_date: '2026-01-01T00:00:00Z',
                refs: { landing_page: 'https://www.themuse.com/jobs/fictional/1' },
                contents: '<p>React work.</p>',
              },
            ],
            total: 1,
            page: 1,
            page_count: 1,
          });
        }
        return jsonResponse({ error: 'upstream boom' }, 500);
      }),
    );

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'Software Engineering' })
      .expect(200);

    expect(res.body.data.listings.length).toBe(1);
    expect(res.body.data.anySucceeded).toBe(true);
    expect(res.body.data.partial).toBe(true);

    const museStatus = res.body.data.providerStatus.find((s: { source: string }) => s.source === 'muse');
    expect(museStatus.status).toBe('ok');
    const adzunaStatus = res.body.data.providerStatus.find((s: { source: string }) => s.source === 'adzuna');
    expect(adzunaStatus.status).toBe('upstream_error');
    // Upstream error body must not leak to the client.
    expect(JSON.stringify(res.body)).not.toContain('upstream boom');
  });

  it('reports an unconfigured provider without querying or faking it', async () => {
    token = await register(`unconfigured-${Date.now()}@test.com`);
    await createProfile(token);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('themuse.com')) {
        return jsonResponse({ results: [], total: 0, page: 1, page_count: 0 });
      }
      return jsonResponse({}, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const adzuna = res.body.data.providerStatus.find((s: { source: string }) => s.source === 'adzuna');
    expect(adzuna.status).toBe('not_configured');
    expect(adzuna.queried).toBe(false);
    // Adzuna was never called because it has no credentials.
    expect(String(fetchMock.mock.calls.map((c) => c[0])).includes('adzuna')).toBe(false);
  });

  it('distinguishes an empty result set from a failed search', async () => {
    token = await register(`empty-${Date.now()}@test.com`);
    await createProfile(token);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [], total: 0, page: 1, page_count: 0 })));

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'No Such Role' })
      .expect(200);

    expect(res.body.data.listings).toHaveLength(0);
    expect(res.body.data.anySucceeded).toBe(true);
    const muse = res.body.data.providerStatus.find((s: { source: string }) => s.source === 'muse');
    expect(muse.status).toBe('empty'); // empty, not an error
  });

  it('imports listings idempotently and matches them with the existing engine', async () => {
    token = await register(`import-${Date.now()}@test.com`);
    await createProfile(token);

    const listing = {
      sourceName: 'muse',
      sourceJobId: 'muse-100',
      title: 'Senior React Engineer',
      companyName: 'Fictional Labs',
      sourceUrl: 'https://www.themuse.com/jobs/fictional-labs/100',
      applicationUrl: 'https://www.themuse.com/jobs/fictional-labs/100',
    };

    const first = await request(app)
      .post('/api/jobs/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'selection', listings: [listing] })
      .expect(201);
    expect(first.body.data.imported).toBe(1);

    // Idempotent: re-importing the same listing skips it.
    const second = await request(app)
      .post('/api/jobs/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'selection', listings: [listing] })
      .expect(201);
    expect(second.body.data.imported).toBe(0);
    expect(second.body.data.skipped).toBe(1);

    const jobs = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(jobs.body.data.total).toBe(1);
    // Source attribution + original URL are preserved on the stored job.
    expect(jobs.body.data.jobs[0].source).toBe('muse');

    // The imported job flows into the EXISTING matching engine.
    const matches = await request(app)
      .get('/api/jobs/matches')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(matches.body.data.total).toBe(1);
    const match = matches.body.data.matches[0];
    expect(match.title).toBe('Senior React Engineer');
    expect(typeof match.matchScore).toBe('number');
    // Coverage is reported so insufficient data is distinguishable.
    expect(typeof match.evaluatedWeight).toBe('number');
    expect(typeof match.insufficientData).toBe('boolean');
  });

  it('scopes imported jobs to the importing user', async () => {
    token = await register(`owner-${Date.now()}@test.com`);
    otherToken = await register(`intruder-${Date.now()}@test.com`);
    await createProfile(token);
    await createProfile(otherToken);

    await request(app)
      .post('/api/jobs/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        mode: 'selection',
        listings: [
          { sourceName: 'muse', sourceJobId: 'priv-1', title: 'Private Job', companyName: 'Fictional' },
        ],
      })
      .expect(201);

    // Another user cannot see, match, or read the imported job.
    const otherJobs = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherJobs.body.data.total).toBe(0);

    const otherMatches = await request(app)
      .get('/api/jobs/matches')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherMatches.body.data.total).toBe(0);
  });

  it('ranks relevant listings first without dropping loosely related ones', async () => {
    token = await register(`relevance-${Date.now()}@test.com`);
    await createProfile(token);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('themuse.com')) {
          return jsonResponse({
            results: [
              {
                id: 1,
                name: 'Tier III Service Desk Engineer',
                company: { name: 'Loose Co' },
                levels: [{ short_name: 'junior' }],
                locations: [{ name: 'Remote' }],
                refs: { landing_page: 'https://www.themuse.com/jobs/loose/1' },
                contents: '<p>Support role.</p>',
              },
              {
                id: 2,
                name: 'React Developer',
                company: { name: 'Exact Co' },
                levels: [{ short_name: 'mid' }],
                locations: [{ name: 'Remote' }],
                refs: { landing_page: 'https://www.themuse.com/jobs/exact/2' },
                contents: '<p>React work.</p>',
              },
              {
                id: 3,
                name: 'Senior React Developer',
                company: { name: 'Variant Co' },
                levels: [{ short_name: 'senior' }],
                locations: [{ name: 'Remote' }],
                refs: { landing_page: 'https://www.themuse.com/jobs/variant/3' },
                contents: '<p>React work.</p>',
              },
            ],
            total: 3,
            page: 1,
            page_count: 1,
          });
        }
        return jsonResponse({}, 500);
      }),
    );

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ query: 'React Developer' })
      .expect(200);

    const titles = res.body.data.listings.map((l: { title: string }) => l.title);
    // Nothing is filtered out: the loosely related role is still returned.
    expect(titles).toHaveLength(3);
    expect(titles).toEqual(expect.arrayContaining(['Tier III Service Desk Engineer']));
    // But the exact and variant matches rank first.
    expect(titles[0]).toBe('React Developer');
    expect(titles[1]).toBe('Senior React Developer');
    expect(titles[2]).toBe('Tier III Service Desk Engineer');
    // Attribution and original URLs survive reordering.
    expect(res.body.data.listings[0].sourceUrl).toBe('https://www.themuse.com/jobs/exact/2');
    expect(res.body.data.listings[0].sourceDisplayName).toBe('The Muse');
  });

  it('rejects unauthenticated access to every discovery route', async () => {
    await request(app).get('/api/jobs/search').expect(401);
    await request(app).get('/api/jobs/sources').expect(401);
    await request(app).post('/api/jobs/import').send({ mode: 'selection', listings: [] }).expect(401);
    await request(app).post('/api/jobs/sync').send({}).expect(401);
  });

  it('validates search query parameters', async () => {
    token = await register(`validate-${Date.now()}@test.com`);
    await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 0 })
      .expect(422);
    await request(app)
      .get('/api/jobs/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ pageSize: 500 })
      .expect(422);
  });
});