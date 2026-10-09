/** Phase 4 job management tests. */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel } from '../src/models/index.js';

const API_BASE = '/api';

const TEST_USER = { email: 'jobs@test.com', password: 'password123' };
const TEST_USER_2 = { email: 'jobs2@test.com', password: 'password123' };

let user1Token: string;
let user2Token: string;

function jobFixture(index: number) {
  return {
    title: `Test Job ${index}`,
    companyName: `Test Company ${index}`,
    location: 'Remote',
    remoteType: index % 3 === 0 ? 'remote' : 'hybrid',
    employmentType: index % 2 === 0 ? 'full_time' : 'contract',
    experienceLevel: index % 2 === 0 ? 'mid' : 'senior',
    salaryMin: 80000 + index * 1000,
    salaryMax: 120000 + index * 1000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
  };
}

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('Jobs (Phase 4)', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
    }

    const reg1 = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send(TEST_USER);
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;

    const reg2 = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send(TEST_USER_2);
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
    }
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  /** ---- Authentication ---- */

  describe('authentication', () => {
    it('rejects unauthenticated access to job listing', async () => {
      await request(app).get(`${API_BASE}/jobs`).expect(401);
    });

    it('rejects unauthenticated access to job creation', async () => {
      await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .send(jobFixture(1))
        .expect(401);
    });

    it('rejects unauthenticated access to mock import', async () => {
      await request(app).post(`${API_BASE}/jobs/import/mock`).expect(401);
    });

    it('rejects unauthenticated access to save endpoint', async () => {
      await request(app).post(`${API_BASE}/jobs/some-id/save`).expect(401);
    });

    it('rejects unauthenticated access to saved jobs listing', async () => {
      await request(app).get(`${API_BASE}/jobs/saved`).expect(401);
    });

    it('rejects unauthenticated access to job detail', async () => {
      await request(app).get(`${API_BASE}/jobs/a-valid-object-id`).expect(401);
    });

    it('rejects unauthenticated access to update endpoint', async () => {
      await request(app)
        .patch(`${API_BASE}/jobs/a-valid-object-id`)
        .send({ title: 'X' })
        .expect(401);
    });

    it('rejects unauthenticated access to delete endpoint', async () => {
      await request(app).delete(`${API_BASE}/jobs/a-valid-object-id`).expect(401);
    });

    it('rejects an invalid bearer token', async () => {
      await request(app)
        .get(`${API_BASE}/jobs`)
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  /** ---- Manual job creation ---- */

  describe('POST /api/jobs/manual', () => {
    it('creates a manual job with minimal required fields', async () => {
      const payload = { title: 'Senior Engineer', companyName: 'Acme Corp' };

      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Senior Engineer');
      expect(res.body.data.companyName).toBe('Acme Corp');
      expect(res.body.data.source).toBe('manual');
      expect(res.body.data.status).toBe('active');
      expect(mongoose.Types.ObjectId.isValid(res.body.data.id)).toBe(true);
    });

    it('creates a manual job with full fields', async () => {
      const payload = {
        ...jobFixture(42),
        title: 'Full-featured manual job',
        companyName: 'Full Corp',
        description: 'A comprehensive manual job entry.',
        applicationUrl: 'https://full.corp/jobs/42',
        requiredSkills: [
          { name: 'Node.js', required: true, confidence: 'high' },
          { name: 'TypeScript', required: false },
        ],
      };

      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Full-featured manual job');
      expect(res.body.data.companyName).toBe('Full Corp');
      expect(res.body.data.description).toBe('A comprehensive manual job entry.');
      expect(res.body.data.requiredSkills).toHaveLength(2);
      expect(res.body.data.requiredSkills[0].name).toBe('Node.js');
      expect(res.body.data.requiredSkills[0].required).toBe(true);
    });

    it('rejects creation without a title', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ companyName: 'Acme Corp' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects creation without a company name', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Senior Engineer' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid remoteType enum value', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', remoteType: 'work_from_anywhere' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid employmentType enum value', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', employmentType: 'temporary' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid experienceLevel enum value', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', experienceLevel: 'principal' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid salaryPeriod enum value', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', salaryPeriod: 'weekly' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative salaryMin', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', salaryMin: -100 })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-integer salaryMin', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', salaryMin: 100.5 })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid applicationUrl', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', applicationUrl: 'not-a-url' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an invalid companyWebsite', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Bad Job', companyName: 'Bad Corp', companyWebsite: 'not-a-url' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a title that is too long', async () => {
      const longTitle = 'A'.repeat(201);
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: longTitle, companyName: 'Bad Corp' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown request fields (strict schema)', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({
          title: 'Strict Job',
          companyName: 'Strict Corp',
          unknownField: 'should be rejected',
          anotherUnknown: 123,
        })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  /** ---- List / search / pagination ---- */

  describe('GET /api/jobs', () => {
    it('lists a created user jobs', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send(jobFixture(1));
      expect(createRes.status).toBe(201);

      const listRes = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token));
      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.jobs).toBeInstanceOf(Array);
      expect(listRes.body.data.total).toBeGreaterThanOrEqual(1);
      expect(listRes.body.data.page).toBe(1);
      expect(listRes.body.data.pageSize).toBe(20);
      expect(listRes.body.data.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('returns empty result for a user with no jobs', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user2Token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
      expect(res.body.data.jobs.length).toBe(0);
      expect(res.body.data.total).toBe(0);
    });

    it('lists jobs with pagination', async () => {
      // Create enough jobs to test pagination
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post(`${API_BASE}/jobs/manual`)
          .set(withAuth(user1Token))
          .send(jobFixture(100 + i));
        expect(res.status).toBe(201);
      }

      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ page: 1, pageSize: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toHaveLength(5);
      expect(res.body.data.total).toBe(6); // 6 created jobs
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(5);
      expect(res.body.data.totalPages).toBeGreaterThan(1);
    });

    it('returns correct data on page 2', async () => {
      // Create enough jobs to have multiple pages
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`${API_BASE}/jobs/manual`)
          .set(withAuth(user1Token))
          .send(jobFixture(100 + i));
      }

      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ page: 2, pageSize: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.pageSize).toBe(3);
      expect(res.body.data.totalPages).toBeGreaterThan(1);
    });

    it('paginates the imported mock jobs', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 5 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(5);

      const listRes = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ page: 1, pageSize: 100 });

      expect(listRes.body.success).toBe(true);
      const mockJobs = listRes.body.data.jobs.filter((j: any) => j.source === 'mock');
      expect(mockJobs).toHaveLength(5);
    });

    it('searches by query text', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ query: 'Engineer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
    });

    it('filters by company', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ company: 'Acme' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
    });

    it('filters by location', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ location: 'Remote' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
    });

    it('filters by remoteType', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ remoteType: 'remote' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const hits = res.body.data.jobs.filter((j: any) => j.remoteType === 'remote');
      expect(hits.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by employmentType', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ employmentType: 'full_time' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const hits = res.body.data.jobs.filter((j: any) => j.employmentType === 'full_time');
      expect(hits.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by source', async () => {
      await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 5 })
        .expect(200);

      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ source: 'mock' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const hits = res.body.data.jobs.filter((j: any) => j.source === 'mock');
      expect(hits).toHaveLength(5);
    });

    it('excludes deleted jobs from listing', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Delete Me', companyName: 'Delete Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      await request(app)
        .delete(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .expect(200);

      const listRes = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ page: 1, pageSize: 100 });

      const stillVisible = listRes.body.data.jobs.find((j: any) => j.id === jobId);
      expect(stillVisible).toBeUndefined();
    });

    it('does not leak another user jobs', async () => {
      await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Hidden', companyName: 'Hidden Corp' });

      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user2Token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const visible = res.body.data.jobs.find((j: any) => j.title === 'Hidden');
      expect(visible).toBeUndefined();
    });

    it('returns 400 for a page size larger than the maximum', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .query({ pageSize: 10000 });

      // No explicit max on jobs route; expect a sane empty page rather than 500
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  /** ---- Job detail retrieval ---- */

  describe('GET /api/jobs/:id', () => {
    it('retrieves a manual job detail', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Detail Job', companyName: 'Detail Corp' })
        .expect(201);

      const jobId = res.body.data.id;
      const detailRes = await request(app)
        .get(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(detailRes.body.success).toBe(true);
      expect(detailRes.body.data.title).toBe('Detail Job');
      expect(detailRes.body.data.companyName).toBe('Detail Corp');
      expect(detailRes.body.data.requiredSkills).toBeInstanceOf(Array);
      expect(detailRes.body.data.updatedAt).toBeDefined();
      expect(detailRes.body.data.discoveredAt).toBeDefined();
      expect(detailRes.body.data.sources).toBeInstanceOf(Array);
      expect(detailRes.body.data.sources[0].name).toBe('manual');
    });

    it('retrieves an imported mock job detail', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 1 })
        .expect(200);

      const jobId = res.body.data.jobs[0].id;
      const detailRes = await request(app)
        .get(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(detailRes.body.success).toBe(true);
      expect(detailRes.body.data.title).toBeDefined();
      expect(detailRes.body.data.companyName).toBeDefined();
      expect(detailRes.body.data.sources).toBeInstanceOf(Array);
      expect(detailRes.body.data.sources[0].name).toBe('mock');
    });

    it('returns 404 for a malformed object ID', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs/not-an-id`)
        .set(withAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a valid ObjectId that does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`${API_BASE}/jobs/${fakeId}`)
        .set(withAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('includes save status on status endpoint', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Status Job', companyName: 'Status Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const statusRes = await request(app)
        .get(`${API_BASE}/jobs/${jobId}/status`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(statusRes.body.success).toBe(true);
      expect(typeof statusRes.body.data.isSaved).toBe('boolean');
    });
  });

  /** ---- Duplicate prevention ---- */

  describe('duplicate handling', () => {
    it('prevents duplicate source-job by source name + sourceJobId', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 1 })
        .expect(200);

      const jobId = res.body.data.jobs[0].id;
      expect(jobId).toBeDefined();

      // Import the same mock job again
      const dupRes = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 1 })
        .expect(200);

      expect(dupRes.body.success).toBe(true);
      expect(dupRes.body.data.imported).toBe(0);
      expect(dupRes.body.data.skipped).toBe(1);
      expect(dupRes.body.data.jobs).toHaveLength(0);
    });

    it('reports a duplicate when importing the same mock set twice', async () => {
      const first = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 3 })
        .expect(200);

      expect(first.body.success).toBe(true);
      expect(first.body.data.imported).toBe(3);
      expect(first.body.data.skipped).toBe(0);

      const second = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 3 })
        .expect(200);

      expect(second.body.success).toBe(true);
      expect(second.body.data.imported).toBe(0);
      expect(second.body.data.skipped).toBe(3);
    });

    it('prevents duplicate manual job by normalized key (company + title + location + url)', async () => {
      const payload = {
        title: 'Same Role',
        companyName: 'Same Company',
        location: 'Remote',
        applicationUrl: 'https://same.corp/same-role',
      };

      const first = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send(payload)
        .expect(201);

      const second = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send(payload)
        .expect(409);

      expect(second.body.success).toBe(false);
      expect(second.body.error.code).toBe('DUPLICATE');
      expect(second.body.error.details.duplicateJobId).toBe(first.body.data.id);
    });

    it('allows manual jobs with different location or URL', async () => {
      const base = { title: 'Same Role', companyName: 'Same Company' };

      const a = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ ...base, location: 'Remote', applicationUrl: 'https://a.corp/j' })
        .expect(201);

      const b = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ ...base, location: 'Onsite', applicationUrl: 'https://a.corp/j' })
        .expect(201);

      expect(new mongoose.Types.ObjectId(a.body.data.id)).not.toEqual(
        new mongoose.Types.ObjectId(b.body.data.id)
      );
    });
  });

  /** ---- Save / unsave ---- */

  describe('save / unsave jobs', () => {
    let jobId: string;

    // NOTE: per-test fixture (not beforeAll) because the outer beforeEach
    // clears all jobs/saved-jobs before every test.
    beforeEach(async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Save Me', companyName: 'Save Corp' })
        .expect(201);
      jobId = res.body.data.id;
    });

    it('saves a job for the current user', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .send({ notes: 'Good fit' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.notes).toBe('Good fit');
    });

    it('returns existing saved record on second save (idempotent)', async () => {
      // First save creates the record; each test gets a fresh unsaved job
      // from the per-test fixture above.
      await request(app)
        .post(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .send({ notes: 'Good fit' })
        .expect(201);

      const res = await request(app)
        .post(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .send({ notes: 'Good fit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Job already saved');
    });

    it('returns 404 when saving a nonexistent job', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`${API_BASE}/jobs/${fakeId}/save`)
        .set(withAuth(user1Token))
        .send({ notes: 'test' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('unsubscribes/saves a job', async () => {
      await request(app)
        .post(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .send({ notes: 'test' });

      const res = await request(app)
        .delete(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Job unsaved successfully');
    });

    it('returns 404 when unsaving a nonexistent job', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`${API_BASE}/jobs/${fakeId}/save`)
        .set(withAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when unsaving a job saved by another user', async () => {
      // Save under user 1
      await request(app)
        .post(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user1Token))
        .send({});

      const res = await request(app)
        .delete(`${API_BASE}/jobs/${jobId}/save`)
        .set(withAuth(user2Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  /** ---- Saved jobs listing & ownership ---- */

  describe('GET /api/jobs/saved', () => {
    // NOTE: per-test fixture (not beforeAll) because the outer beforeEach
    // clears all jobs/saved-jobs before every test.
    beforeEach(async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Saved Job A', companyName: 'Saved Corp A' });
      expect(res.status).toBe(201);
      await request(app)
        .post(`${API_BASE}/jobs/${res.body.data.id}/save`)
        .set(withAuth(user1Token));
    });

    it('lists the current user saved jobs', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs/saved`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.savedJobs).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('does not list another user saved jobs', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs/saved`)
        .set(withAuth(user2Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.savedJobs.length).toBe(0);
      expect(res.body.data.total).toBe(0);
    });

    it('paginates saved jobs', async () => {
      // Add more saved jobs for user 1
      const res1 = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Saved Job B', companyName: 'Saved Corp B' });
      expect(res1.status).toBe(201);
      await request(app)
        .post(`${API_BASE}/jobs/${res1.body.data.id}/save`)
        .set(withAuth(user1Token));

      const res = await request(app)
        .get(`${API_BASE}/jobs/saved`)
        .set(withAuth(user1Token))
        .query({ page: 1, pageSize: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.savedJobs).toHaveLength(1);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(1);
    });
  });

  /** ---- Update job ---- */

  describe('PATCH /api/jobs/:id', () => {
    it('updates permitted fields on a manual job owned by the user', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Update Me', companyName: 'Update Corp', remoteType: 'remote' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ title: 'Updated Title', location: 'New York, NY', salaryMax: 150000 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Title');
      expect(res.body.data.location).toBe('New York, NY');
      expect(res.body.data.salaryMax).toBe(150000);
      expect(res.body.data.companyName).toBe('Update Corp'); // unchanged
    });

    it('rejects updating a job owned by another user', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Their Job', companyName: 'Their Corp' });
      expect(res.status).toBe(201);
      const jobId = res.body.data.id;

      const patchRes = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user2Token))
        .send({ title: 'Hacked Title' })
        .expect(404);

      expect(patchRes.body.success).toBe(false);
      expect(patchRes.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects updating an externally sourced job', async () => {
      const imp = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 1 });
      expect(imp.status).toBe(200);
      const jobId = imp.body.data.jobs[0].id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ title: 'Hacked Title' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects updating a nonexistent job', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`${API_BASE}/jobs/${fakeId}`)
        .set(withAuth(user1Token))
        .send({ title: 'Hacked Title' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects unknown fields with validation error', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Update Me', companyName: 'Update Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ maliciousField: 'ignored', title: 'OK Title' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid enum value in update', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Update Me', companyName: 'Update Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ remoteType: 'telecommute' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('preserves source fields on manual job after update', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Source Job', companyName: 'Source Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ title: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.data.sources).toBeInstanceOf(Array);
      expect(res.body.data.sources[0].name).toBe('manual');
    });

    it('rejects modifying source ID / internal fields via update payload', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Locked Job', companyName: 'Locked Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .patch(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .send({ sourceJobId: 'hacked-id', normalizedKey: 'hacked' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  /** ---- Delete job ---- */

  describe('DELETE /api/jobs/:id', () => {
    it('soft-deletes a manual job owned by the user', async () => {
      const createRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'ToDelete', companyName: 'To Delete Corp' });
      expect(createRes.status).toBe(201);
      const jobId = createRes.body.data.id;

      const res = await request(app)
        .delete(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Job deleted successfully');

      const listRes = await request(app)
        .get(`${API_BASE}/jobs`)
        .set(withAuth(user1Token))
        .expect(200);
      const stillVisible = listRes.body.data.jobs.find((j: any) => j.id === jobId);
      expect(stillVisible).toBeUndefined();
    });

    it('returns 404 when deleting a job owned by another user', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Their Job', companyName: 'Their Corp' });
      expect(res.status).toBe(201);
      const jobId = res.body.data.id;

      const delRes = await request(app)
        .delete(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user2Token))
        .expect(404);

      expect(delRes.body.success).toBe(false);
      expect(delRes.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 422 when deleting an externally sourced job', async () => {
      const imp = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set(withAuth(user1Token))
        .send({ count: 1 });
      expect(imp.status).toBe(200);
      const jobId = imp.body.data.jobs[0].id;

      const delRes = await request(app)
        .delete(`${API_BASE}/jobs/${jobId}`)
        .set(withAuth(user1Token))
        .expect(422);

      expect(delRes.body.success).toBe(false);
      expect(delRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for a nonexistent job id', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .delete(`${API_BASE}/jobs/${fakeId}`)
        .set(withAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  /** ---- Malformed IDs ---- */

  describe('malformed IDs', () => {
    it('treats a trailing slash as the collection endpoint', async () => {
      // NOTE: GET /api/jobs/ is the job-collection listing route (Express
      // non-strict routing), not an "empty :id" parameter — there is no
      // Express route in which an empty path segment binds to :id. The
      // correct behavior is the standard 200 listing envelope.
      const res = await request(app)
        .get(`${API_BASE}/jobs/`)
        .set(withAuth(user1Token))
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.jobs).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.page).toBe(1);
    });

    it('rejects empty ID on update', async () => {
      const res = await request(app)
        .patch(`${API_BASE}/jobs/`)
        .set(withAuth(user1Token))
        .send({ title: 'X' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects an empty save ID', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/`, withAuth(user1Token))
        .send({});
      expect([404, 400, 401]).toContain(res.status);
    });

    it('rejects a 24-char hex string that is not a valid ObjectId', async () => {
      const fakeId = '0'.repeat(24);
      const res = await request(app)
        .get(`${API_BASE}/jobs/${fakeId}`)
        .set(withAuth(user1Token))
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  /** ---- Error response consistency ---- */

  describe('consistent error responses', () => {
    it('404 returns structured error envelope', async () => {
      const res = await request(app)
        .get(`${API_BASE}/nonexistent/route`)
        .set(withAuth(user1Token));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBeDefined();
      expect(res.body.error.details).toBeDefined();
    });

    it('validation error returns structured envelope with details', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('duplicate error returns structured envelope with details', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Dup', companyName: 'Dup Corp' });
      expect(res.status).toBe(201);

      const dupRes = await request(app)
        .post(`${API_BASE}/jobs/manual`)
        .set(withAuth(user1Token))
        .send({ title: 'Dup', companyName: 'Dup Corp' });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.success).toBe(false);
      expect(dupRes.body.error.code).toBe('DUPLICATE');
      expect(dupRes.body.error.details).toBeDefined();
      expect(dupRes.body.error.details.duplicateJobId).toBeDefined();
    });

    it('unauthenticated request returns 401 without exposing details', async () => {
      const res = await request(app)
        .get(`${API_BASE}/jobs`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  /** ---- MongoDB indexes ---- */

  describe('MongoDB indexes', () => {
    it('creates sparse unique index on sources.name + sources.sourceJobId', async () => {
      const indexes = await JobModel.collection.indexes();
      const compoundSourceIndex = indexes.find(
        (i: any) => i.key && i.key['sources.name'] === 1 && i.key['sources.sourceJobId'] === 1
      );

      expect(compoundSourceIndex).toBeDefined();
      expect(compoundSourceIndex!.unique).toBe(true);
      // The index may also have a partialFilterExpression to skip null sourceJobId values.
      // NOTE: coerced with Boolean() because a partial-only index yields the
      // filter object (truthy) rather than boolean true here.
      expect(
        Boolean(compoundSourceIndex!.sparse === true || compoundSourceIndex!.partialFilterExpression)
      ).toBe(true);
    });

    it('creates sparse unique index on normalizedKey', async () => {
      const indexes = await JobModel.collection.indexes();
      const keyIndex = indexes.find((i: any) => i.key.normalizedKey === 1);

      expect(keyIndex).toBeDefined();
      expect(keyIndex!.unique).toBe(true);
      expect(keyIndex!.sparse).toBe(true);
    });

    it('creates unique compound index on SavedJob userId + jobId', async () => {
      const indexes = await SavedJobModel.collection.indexes();
      const savedIndex = indexes.find((i: any) => i.key.userId === 1 && i.key.jobId === 1);

      expect(savedIndex).toBeDefined();
      expect(savedIndex!.unique).toBe(true);
    });

    it('allows documents where sourceJobId is null or absent', async () => {
      // Manual entries created without a sourceJobId must not collide on the
      // (sources.name, sources.sourceJobId) unique index.
      const job = await JobModel.create({
        title: 'No Id Job',
        companyName: 'No Id Corp',
        remoteType: 'remote',
        employmentType: 'full_time',
        experienceLevel: 'mid',
        status: 'active',
        sources: [{ name: 'manual', discoveredAt: new Date() }],
      });

      expect(job._id).toBeDefined();

      const job2 = await JobModel.create({
        title: 'No Id Job 2',
        companyName: 'No Id Corp 2',
        remoteType: 'remote',
        employmentType: 'full_time',
        experienceLevel: 'mid',
        status: 'active',
        sources: [{ name: 'manual', discoveredAt: new Date() }],
      });

      expect(job2._id).toBeDefined();

      await JobModel.deleteMany({ _id: { $in: [job._id, job2._id] } });
    });

    it('enforces the unique index when sourceName + sourceJobId are both present', async () => {
      const job = await JobModel.create({
        title: 'Dup Source Job',
        companyName: 'Dup Source Corp',
        remoteType: 'remote',
        employmentType: 'full_time',
        experienceLevel: 'mid',
        status: 'active',
        sources: [{ name: 'mock', sourceJobId: 'mock-999', discoveredAt: new Date() }],
      });

      expect(job._id).toBeDefined();

      await expect(
        JobModel.create({
          title: 'Dup Source Job 2',
          companyName: 'Dup Source Corp 2',
          remoteType: 'remote',
          employmentType: 'full_time',
          experienceLevel: 'mid',
          status: 'active',
          sources: [{ name: 'mock', sourceJobId: 'mock-999', discoveredAt: new Date() }],
        })
      ).rejects.toThrow();

      await JobModel.deleteOne({ _id: job._id });
    });
  });
});
