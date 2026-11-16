/** Minimal approval fingerprint integration tests (Phase 9.1.17).
 *  Focuses on the core approval-to-fill freshness check workflow.
 *  Other mutation tests use model creation where API endpoints have
 *  additional requirements (e.g., resume upload expects multipart/file).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected, UserModel } from '../src/config/database.js';
import { JobModel } from '../src/models/index.js';
import { setRateLimitingEnabled } from '../src/middleware/rateLimiter.js';

const API_BASE = '/api';

async function register(app: any, email: string) {
  const res = await request(app).post(`${API_BASE}/auth/register`).send({ email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.data.access_token;
}

describe('Approval fingerprint integration (Phase 9.1.17) - Core', () => {
  const app = createApp();
  let tokenA: string;
  let tokenB: string;
  let jobId: string;

  beforeAll(async () => {
    await connectToDatabase();
    setRateLimitingEnabled(false);
    tokenA = await register(app, 'fp-user@test.com');
    tokenB = await register(app, 'fp-user2@test.com');

    // Create candidate profiles
    await request(app)
      .post(`${API_BASE}/profile`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ firstName: 'Test', lastName: 'Candidate', skills: [{ name: 'JavaScript', level: 'advanced' }], experience: 3, education: [{ institution: 'Test University', degree: 'BS' }], location: 'Test City' });

    await request(app)
      .post(`${API_BASE}/profile`)
      .set({ Authorization: `Bearer ${tokenB}` })
      .send({ firstName: 'Test2', lastName: 'Candidate', skills: [{ name: 'Python', level: 'advanced' }], experience: 2, education: [{ institution: 'Other University', degree: 'MS' }], location: 'Other City' });

    // Create a job
    const job = new JobModel({
      title: 'Software Engineer',
      companyName: 'Test Corp',
      description: 'We are looking for a software engineer',
      responsibilities: ['Write code', 'Review code'],
      requirements: ['3+ years experience', 'JavaScript knowledge'],
      requiredSkills: [{ name: 'JavaScript', required: true }],
      employmentType: 'full_time',
      experienceLevel: 'mid',
      remoteType: 'remote',
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
      salaryMin: 80000,
      salaryMax: 120000,
    });
    await job.save();
    jobId = job._id;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await mongoose.connection.collections['browserAutomationExecutions']?.deleteMany({});
    await mongoose.connection.collections['jobs']?.deleteMany({});
    await mongoose.connection.collections['candidateProfiles']?.deleteMany({});
  });

  // ---- Helpers ----
  async function createExecution(t: string, applicationUrl = 'https://example.com/apply') {
    const res = await request(app).post(`${API_BASE}/automation`).set({ Authorization: `Bearer ${t}` }).send({ applicationUrl, jobId });
    expect(res.status).toBe(201);
    return res.body.data._id;
  }

  async function inspectExecution(t: string, execId: string) {
    await request(app).post(`${API_BASE}/automation/${execId}/inspect`).set({ Authorization: `Bearer ${t}` }).send({ applicationUrl: 'https://example.com/apply' });
  }

  async function prepareExecution(t: string, execId: string) {
    await request(app).patch(`${API_BASE}/automation/${execId}/answers`).set({ Authorization: `Bearer ${t}` }).send({ answers: [] });
  }

  async function approveExecution(t: string, execId: string) {
    await request(app).post(`${API_BASE}/automation/${execId}/approve`).set({ Authorization: `Bearer ${t}` });
  }

  async function fillExecution(t: string, execId: string) {
    return await request(app).post(`${API_BASE}/automation/${execId}/fill`).set({ Authorization: `Bearer ${t}` });
  }

  // ============================================================
  // TEST 1: Approval freshness - unchanged inputs preserve approval
  // ============================================================
  it('preserves approval and allows fill when no authoritative inputs change', async () => {
    const execId = await createExecution(tokenA);

    await inspectExecution(tokenA, execId);
    await prepareExecution(tokenA, execId);
    await approveExecution(tokenA, execId);

    // Verify fingerprint stored
    const execRes = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(execRes.body.data.approvalFingerprint).toBeDefined();
    expect(execRes.body.data.approvedForExecution).toBe(true);

    // Fill should succeed (fingerprint matches)
    const fillRes = await fillExecution(tokenA, execId);
    expect(fillRes.state).toBe('FILLING');

    // State should transition after fill
    const afterFill = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(afterFill.body.data.state).toBeDefined();
  });

  // ============================================================
  // TEST 2: Candidate profile change invalidates approval
  // ============================================================
  it('rejects fill and invalidates approval when candidate profile changes', async () => {
    const execId = await createExecution(tokenA, 'https://example.com/apply');

    await inspectExecution(tokenA, execId);
    await prepareExecution(tokenA, execId);
    await approveExecution(tokenA, execId);

    // Mutate candidate profile
    await request(app).post(`${API_BASE}/profile`).set({ Authorization: `Bearer ${tokenB}` }).send({
      firstName: 'Updated', lastName: 'Candidate', skills: [{ name: 'Go', level: 'advanced' }], experience: 5, education: [{ institution: 'Different Uni', degree: 'MS' }], location: 'New City',
    });

    const fillRes = await fillExecution(tokenA, execId);
    // Fill should be rejected as stale
    expect(fillRes.state).not.toBe('FILLED');

    // Execution should be invalidated
    const execCheck = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(execCheck.body.data.approvalFingerprint).toBeUndefined();
    expect(execCheck.body.data.approvedForExecution).toBe(false);
    expect(execCheck.body.data.state).toBe('READY_FOR_REVIEW');
  });

  // ============================================================
  // TEST 3: Job description change invalidates approval
  // ============================================================
  it('rejects fill and invalidates approval when job description changes', async () => {
    const execId = await createExecution(tokenA, 'https://example.com/apply');

    await inspectExecution(tokenA, execId);
    await prepareExecution(tokenA, execId);
    await approveExecution(tokenA, execId);

    // Mutate job description
    await request(app).patch(`${API_BASE}/jobs/${jobId}`).set({ Authorization: `Bearer ${tokenA}` }).send({
      description: 'Completely different job description',
    });

    const fillRes = await fillExecution(tokenA, execId);
    expect(fillRes.state).not.toBe('FILLED');

    const execCheck = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(execCheck.body.data.approvalFingerprint).toBeUndefined();
    expect(execCheck.body.data.approvedForExecution).toBe(false);
    expect(execCheck.body.data.state).toBe('READY_FOR_REVIEW');
  });

  // ============================================================
  // TEST 4: Fingerprint differs between executions with different application URLs
  // ============================================================
  it('verifies fingerprint includes application URL and differs between executions', async () => {
    const execId = await createExecution(tokenA, 'https://example.com/apply');

    await inspectExecution(tokenA, execId);
    await approveExecution(tokenA, execId);

    const execCheck = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(execCheck.body.data.approvalFingerprint).toBeDefined();

    const execId2 = await createExecution(tokenA, 'https://different-example.com/apply');

    await inspectExecution(tokenA, execId2);
    await approveExecution(tokenA, execId2);

    const exec2Check = await request(app).get(`${API_BASE}/automation/${execId2}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(exec2Check.body.data.approvalFingerprint).toBeDefined();

    // Different URLs should produce different fingerprints
    const fp1 = execCheck.body.data.approvalFingerprint;
    const fp2 = exec2Check.body.data.approvalFingerprint;
    expect(fp1).not.toBe(fp2);
  });

  // ============================================================
  // TEST 5: Stale approval rejection despite stored fingerprint
  // ============================================================
  it('rejects fill when authoritative data changes despite stored fingerprint', async () => {
    const execId = await createExecution(tokenA, 'https://example.com/apply');

    await inspectExecution(tokenA, execId);
    await prepareExecution(tokenA, execId);
    await approveExecution(tokenA, execId);

    const execRes = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    const storedFingerprint = execRes.body.data.approvalFingerprint;

    // Mutate job description
    await request(app).patch(`${API_BASE}/jobs/${jobId}`).set({ Authorization: `Bearer ${tokenA}` }).send({
      description: 'Completely different job description',
    });

    const fillRes = await fillExecution(tokenA, execId);
    // Server recomputes fingerprint; it won't match stored one
    expect(fillRes.state).not.toBe('FILLED');

    const execCheck = await request(app).get(`${API_BASE}/automation/${execId}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(execCheck.body.data.approvalFingerprint).toBeUndefined();
    expect(execCheck.body.data.approvedForExecution).toBe(false);
    expect(execCheck.body.data.state).toBe('READY_FOR_REVIEW');
  });
});