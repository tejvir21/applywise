/** Job source adapter + registry regression tests (Phase 5 Step 1). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel } from '../src/models/index.js';
import { jobSourceRegistry, mockJobSource, manualJobSource } from '../src/jobs/index.js';

const API_BASE = '/api';
let userToken: string;

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const RAW_MOCK_JOB = {
  title: '  Senior Software Engineer ',
  companyName: 'TechCorp Inc.',
  location: 'San Francisco, CA',
  remoteType: 'hybrid',
  employmentType: 'full_time',
  experienceLevel: 'senior',
  description: 'Backend services role.',
  requirements: ['5+ years of experience'],
  requiredSkills: [{ name: 'Node.js', required: true }],
  preferredSkills: ['GraphQL'],
  salaryMin: 150000,
  salaryMax: 200000,
  salaryCurrency: 'usd',
  salaryPeriod: 'yearly',
  applicationUrl: 'https://techcorp.example.com/careers/sse',
  sourceName: 'mock',
  sourceJobId: 'mock-001',
  sourceUrl: 'https://mock.example.com/jobs/mock-001',
  postedAt: new Date('2024-01-15'),
};

describe('Job sources (Phase 5 cleanup)', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
    }
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'sources@test.com', password: 'password123' });
    expect(reg.status).toBe(201);
    userToken = reg.body.data.access_token;
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

  describe('MockJobSource.normalizeJob', () => {
    it('terminates and returns the expected normalized job', () => {
      const normalized = mockJobSource.normalizeJob(RAW_MOCK_JOB);

      expect(normalized.title).toBe('Senior Software Engineer');
      expect(normalized.companyName).toBe('TechCorp Inc.');
      expect(normalized.sourceName).toBe('mock');
      expect(normalized.sourceJobId).toBe('mock-001');
      expect(normalized.remoteType).toBe('hybrid');
      expect(normalized.employmentType).toBe('full_time');
      expect(normalized.experienceLevel).toBe('senior');
      expect(normalized.salaryCurrency).toBe('USD');
      expect(normalized.requiredSkills[0].name).toBe('Node.js');
      expect(normalized.requiredSkills[0].required).toBe(true);
      expect(normalized.preferredSkills[0].name).toBe('GraphQL');
      expect(normalized.postedAt).toBeInstanceOf(Date);
    });

    it('normalizes unknown enum values instead of passing them through', () => {
      const normalized = mockJobSource.normalizeJob({
        ...RAW_MOCK_JOB,
        remoteType: 'teleport',
        employmentType: 'gig',
        experienceLevel: 'wizard',
        salaryPeriod: 'weekly',
      });

      expect(normalized.remoteType).toBe('unknown');
      expect(normalized.employmentType).toBe('unknown');
      expect(normalized.experienceLevel).toBe('unknown');
      expect(normalized.salaryPeriod).toBe('yearly');
    });

    it('throws on missing identity fields', () => {
      expect(() => mockJobSource.normalizeJob({ companyName: 'C', sourceName: 'mock', sourceJobId: 'x' })).toThrow('Job title is required');
      expect(() => mockJobSource.normalizeJob({ title: 'T', sourceName: 'mock', sourceJobId: 'x' })).toThrow('Company name is required');
      expect(() => mockJobSource.normalizeJob({ title: 'T', companyName: 'C', sourceJobId: 'x' })).toThrow('Source name is required');
      expect(() => mockJobSource.normalizeJob({ title: 'T', companyName: 'C', sourceName: 'mock' })).toThrow('Source job ID is required');
    });

    it('round-trips a built-in mock fixture through getJob + normalizeJob', async () => {
      const raw = await mockJobSource.getJob('mock-002');
      expect(raw).not.toBeNull();
      const normalized = mockJobSource.normalizeJob(raw);
      expect(normalized.sourceJobId).toBe('mock-002');
      expect(normalized.title).toBeDefined();
    });
  });

  describe('jobSourceRegistry', () => {
    it('has the manual and mock adapters registered', () => {
      expect(jobSourceRegistry.get('manual')).toBe(manualJobSource);
      expect(jobSourceRegistry.get('mock')).toBe(mockJobSource);
    });

    it('registered adapters require no auth and validate', async () => {
      for (const adapter of jobSourceRegistry.getAll()) {
        expect(adapter.requiresAuth).toBe(false);
        await expect(adapter.validateConfiguration()).resolves.toBe(true);
      }
      expect(jobSourceRegistry.get('linkedin')).toBeUndefined();
    });
  });

  describe('POST /api/jobs/import/source', () => {
    it('imports jobs from the registered mock source', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/source`)
        .set(withAuth(userToken))
        .send({ source: 'mock', pageSize: 2 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(2);
      expect(res.body.data.skipped).toBe(0);
      expect(res.body.data.jobs).toHaveLength(2);
      expect(res.body.data.jobs[0].source).toBe('mock');
    });

    it('skips already-imported source jobs on repeat import', async () => {
      await request(app)
        .post(`${API_BASE}/jobs/import/source`)
        .set(withAuth(userToken))
        .send({ source: 'mock', pageSize: 2 })
        .expect(200);

      const second = await request(app)
        .post(`${API_BASE}/jobs/import/source`)
        .set(withAuth(userToken))
        .send({ source: 'mock', pageSize: 2 })
        .expect(200);

      expect(second.body.data.imported).toBe(0);
      expect(second.body.data.skipped).toBe(2);
    });

    it('rejects an unregistered source with a validation error', async () => {
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/source`)
        .set(withAuth(userToken))
        .send({ source: 'linkedin' })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
