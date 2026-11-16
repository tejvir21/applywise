/** Per-user rate limiter verification tests (Phase 8.3.19). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, CandidateProfileModel } from '../src/models/index.js';
import { setRateLimitingEnabled } from '../src/middleware/rateLimiter.js';
import { resetConfigCache } from '../src/config/index.js';

const API_BASE = '/api';

async function register(app: any, email: string) {
  const res = await request(app).post(`${API_BASE}/auth/register`).send({ email, password: 'password123' });
  return res.body.data.access_token;
}

describe('Per-user rate limiting (Phase 8.3.19)', () => {
  const app = createApp();
  let token1: string;
  let token2: string;

  beforeAll(async () => {
    appInstance = app;
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    token1 = await register(app, 'ratelimit1@test.com');
    token2 = await register(app, 'ratelimit2@test.com');
    // Create profiles for both users
    const profilePayload = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+1-555-0100',
      headline: 'Software Engineer',
      professionalSummary: 'Experienced engineer.',
      yearsOfExperience: 5,
      currentJobTitle: 'Software Engineer',
      currentCompany: 'TechCorp',
      skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }],
      experience: [{ company: 'Co', jobTitle: 'Engineer', employmentType: 'full_time', startDate: '2018-01-01T00:00:00.000Z', current: true, description: 'Built things.' }],
      education: [{ institution: 'Uni', degree: 'BS', fieldOfStudy: 'CS', startDate: '2014-01-01T00:00:00.000Z', current: true }],
      jobPreferences: { desiredRoles: ['Engineer'], preferredLocations: ['Remote'], preferredCountries: ['USA'], workMode: ['remote'], employmentTypes: ['full_time'] },
    };
    await request(app).post(`${API_BASE}/profile`).set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` }).send(profilePayload);
    await request(app).post(`${API_BASE}/profile`).set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` }).send({ ...profilePayload, email: 'test2@example.com' });
    setRateLimitingEnabled(true);
  });

  afterAll(async () => {
    setRateLimitingEnabled(false);
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
    }
  });

  describe('AI generation rate limiting', () => {
    it('allows requests below the limit', async () => {
      const jobId = await createJobForUser(token1);
      const prepId = await startPrep(token1, jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({})
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 429 when limit exceeded', async () => {
      const jobId = await createJobForUser(token1);
      const prepId = await startPrep(token1, jobId);

      // Exhaust the limit (10 requests)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
          .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
          .send({ replace: true });
      }

      // 11th request should be rate limited
      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ replace: true });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('different users have independent quotas', async () => {
      const jobId1 = await createJobForUser(token1);
      const jobId2 = await createJobForUser(token2);
      expect(jobId1).toBeDefined();
      expect(jobId2).toBeDefined();
      const prepId1 = await startPrep(token1, jobId1);
      const prepId2 = await startPrep(token2, jobId2);
      expect(prepId1).toBeDefined();
      expect(prepId2).toBeDefined();

      // Exhaust user1's limit
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`${API_BASE}/application-preparations/${prepId1}/tailor-resume`)
          .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
          .send({ replace: true });
      }

      // User2 should still be able to make requests
      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId2}/tailor-resume`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` })
        .send({ replace: true });

      expect(res.status).toBe(200);
    });
  });

  describe('Resume upload rate limiting', () => {
    it('returns 429 when upload limit exceeded', async () => {
      // Exhaust the upload limit (5 requests)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`${API_BASE}/resumes`)
          .set({ Authorization: `Bearer ${token1}` })
          .attach('file', Buffer.from('test'), { filename: 'test.pdf', contentType: 'application/pdf' });
      }

      // 6th request should be rate limited
      const res = await request(app)
        .post(`${API_BASE}/resumes`)
        .set({ Authorization: `Bearer ${token1}` })
        .attach('file', Buffer.from('test'), { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('Job ingestion rate limiting', () => {
    it('returns 429 when ingestion limit exceeded', async () => {
      // Exhaust the ingestion limit (10 requests)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`${API_BASE}/jobs/import/mock`)
          .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
          .send({ count: 1 });
      }

      // 11th request should be rate limited
      const res = await request(app)
        .post(`${API_BASE}/jobs/import/mock`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ count: 1 });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('Unauthenticated access', () => {
    it('unauthenticated requests are protected by auth middleware', async () => {
      const res = await request(app)
        .post(`${API_BASE}/application-preparations/test-id/tailor-resume`)
        .send({});
      expect(res.status).toBe(401);
    });
  });
});

// Helper functions
// Helper functions need app reference - defined inside describe via closure
// These will be set in beforeAll
let appInstance: any;
async function createJobForUser(token: string) {
  const res = await request(appInstance).post(`${API_BASE}/jobs/manual`).set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }).send({
    title: `Test Job ${Math.random().toString(36).slice(2)}`,
    companyName: `Test Co ${Math.random().toString(36).slice(2)}`,
    location: 'Remote',
    remoteType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    requiredSkills: [{ name: 'TypeScript', required: true }],
  });
  return res.body.data.id;
}

async function startPrep(token: string, jobId: string) {
  const res = await request(appInstance)
    .post(`${API_BASE}/application-preparations`)
    .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })
    .send({ jobId });
  return res.body.data.preparationId;
}