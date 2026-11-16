/** Browser automation HTTP integration tests (Phase 9.1.5). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, CandidateProfileModel } from '../src/models/index.js';
import { setRateLimitingEnabled } from '../src/middleware/rateLimiter.js';

const API_BASE = '/api';

async function register(app: any, email: string) {
  const res = await request(app).post(`${API_BASE}/auth/register`).send({ email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.data.access_token;
}

describe('Automation HTTP integration (Phase 9.1.5)', () => {
  const app = createApp();
  let token1: string;
  let token2: string;
  let userId1: string;
  let userId2: string;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    token1 = await register(app, 'autohttp1@test.com');
    token2 = await register(app, 'autohttp2@test.com');
    const u1 = await UserModel.findOne({ email: 'autohttp1@test.com' }).lean();
    const u2 = await UserModel.findOne({ email: 'autohttp2@test.com' }).lean();
    userId1 = u1!._id.toString();
    userId2 = u2!._id.toString();
    setRateLimitingEnabled(false);
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
    }
  });

  describe('Authentication', () => {
    it('unauthenticated create returns 401', async () => {
      await request(app)
        .post(`${API_BASE}/automation`)
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(401);
    });

    it('unauthenticated list returns 401', async () => {
      await request(app).get(`${API_BASE}/automation`).expect(401);
    });

    it('unauthenticated get returns 401', async () => {
      await request(app).get(`${API_BASE}/automation/507f1f77bcf86cd799439011`).expect(401);
    });
  });

  describe('Ownership isolation', () => {
    it('User A cannot read User B execution', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      await request(app)
        .get(`${API_BASE}/automation/${execId}`)
        .set({ Authorization: `Bearer ${token2}` })
        .expect(404);
    });

    it('User A cannot update User B answers', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      await request(app)
        .patch(`${API_BASE}/automation/${execId}/answers`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` })
        .send({ answers: [{ fieldId: 'test', value: 'test' }] })
        .expect(404);
    });

    it('User A cannot access User B evidence', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      await request(app)
        .get(`${API_BASE}/automation/${execId}/evidence`)
        .set({ Authorization: `Bearer ${token2}` })
        .expect(404);
    });
  });

  describe('Validation', () => {
    it('rejects invalid execution ID', async () => {
      await request(app)
        .get(`${API_BASE}/automation/not-an-id`)
        .set({ Authorization: `Bearer ${token1}` })
        .expect(404);
    });

    it('rejects invalid request body', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ invalid: 'field' });
      expect(res.status).toBe(422);
    });

    it('rejects missing applicationUrl', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({});
      expect(res.status).toBe(422);
    });
  });

  describe('State transitions', () => {
    it('cannot cancel from CREATED (terminal check)', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      // CANCELLED is allowed from CREATED, so this should succeed
      await request(app)
        .post(`${API_BASE}/automation/${execId}/cancel`)
        .set({ Authorization: `Bearer ${token1}` })
        .expect(200);

      // Now try to cancel again (should be terminal)
      const res2 = await request(app)
        .post(`${API_BASE}/automation/${execId}/cancel`)
        .set({ Authorization: `Bearer ${token1}` });
      expect(res2.status).toBe(422);
    });

    it('cannot fill without approval', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      const fillRes = await request(app)
        .post(`${API_BASE}/automation/${execId}/fill`)
        .set({ Authorization: `Bearer ${token1}` });
      expect(fillRes.status).toBe(422);
    });

    it('cannot resume from non-PAUSED state', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      const resumeRes = await request(app)
        .post(`${API_BASE}/automation/${execId}/resume`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ resolved: true });
      expect(resumeRes.status).toBe(422);
    });
  });

  describe('Evidence access', () => {
    it('evidence endpoint returns execution data', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      const evidenceRes = await request(app)
        .get(`${API_BASE}/automation/${execId}/evidence`)
        .set({ Authorization: `Bearer ${token1}` })
        .expect(200);

      expect(evidenceRes.body.success).toBe(true);
      expect(evidenceRes.body.data.executionId).toBe(execId);
      expect(evidenceRes.body.data.state).toBe('CREATED');
    });
  });

  describe('Duplicate prevention', () => {
    it('repeated create creates separate executions (no dedup)', async () => {
      const res1 = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const res2 = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);

      expect(res1.body.data._id).not.toBe(res2.body.data._id);
    });
  });

  describe('Challenge recovery', () => {
    it('resume from PAUSED transitions to INSPECTING and invalidates approval', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      // Move to INSPECTING (CREATED -> INSPECTING is valid)
      await request(app)
        .post(`${API_BASE}/automation/${execId}/inspect`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(200);

      // Pause as a challenge (simulates challenge detection persisting PAUSED)
      await request(app)
        .post(`${API_BASE}/automation/${execId}/pause`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({ challengeType: 'CAPTCHA', reason: 'CAPTCHA detected — manual solving required' })
        .expect(200);

      // Verify paused state with approval invalidated
      const paused = await request(app)
        .get(`${API_BASE}/automation/${execId}`)
        .set({ Authorization: `Bearer ${token1}` })
        .expect(200);
      expect(paused.body.data.state).toBe('PAUSED');
      expect(paused.body.data.approvedForExecution).toBe(false);
      expect(paused.body.data.approvalFingerprint).toBeUndefined();
      expect(paused.body.data.pauseReason).toContain('CAPTCHA');

      // Resume: explicit authenticated call forces re-inspection, no resolved flag needed
      const resumed = await request(app)
        .post(`${API_BASE}/automation/${execId}/resume`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({})
        .expect(200);
      expect(resumed.body.data.state).toBe('INSPECTING');
      expect(resumed.body.data.approvedForExecution).toBe(false);
      expect(resumed.body.data.approvalFingerprint).toBeUndefined();
      expect(resumed.body.data.pauseReason).toBe('');
    });

    it('cross-user resume from PAUSED is rejected', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      await request(app)
        .post(`${API_BASE}/automation/${execId}/inspect`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(200);

      await request(app)
        .post(`${API_BASE}/automation/${execId}/pause`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({ challengeType: 'CAPTCHA' })
        .expect(200);

      await request(app)
        .post(`${API_BASE}/automation/${execId}/resume`)
        .set({ Authorization: `Bearer ${token2}` })
        .send({})
        .expect(404);
    });

    it('cannot resume from non-PAUSED state', async () => {
      const res = await request(app)
        .post(`${API_BASE}/automation`)
        .set({ 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` })
        .send({ applicationUrl: 'https://example.com/apply' })
        .expect(201);
      const execId = res.body.data._id;

      const resumeRes = await request(app)
        .post(`${API_BASE}/automation/${execId}/resume`)
        .set({ Authorization: `Bearer ${token1}` })
        .send({});
      expect(resumeRes.status).toBe(422);
    });
  });
});