import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../../src/config/database.js';
import { Types } from 'mongoose';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../../src/models/Application.js';
import { SubmissionAttemptModel } from '../../src/models/SubmissionAttempt.js';
import { SubmissionEngine } from '../../src/services/SubmissionEngine.js';
import type { PolicyEvaluation } from '../../src/platforms/SubmissionPolicy.js';

const API_BASE = '/api';

async function seedEnvironment(app: any) {
  const reg = await request(app).post(`${API_BASE}/auth/register`).send({
    email: `engine${Date.now()}@test.com`,
    password: 'password123',
  });
  expect(reg.status).toBe(201);
  const token = reg.body.data.access_token;
  const user = await UserModel.findOne({ email: reg.body.data.email }).exec();
  const userId = user!._id.toString();

  await request(app).post(`${API_BASE}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      skills: [{ name: 'TypeScript' }],
      yearsOfExperience: 5,
      currentJobTitle: 'Software Engineer',
      jobPreferences: {
        desiredRoles: ['Software Engineer'],
        workMode: ['remote', 'hybrid'],
        employmentTypes: ['full_time'],
      },
    });

  const job = await request(app).post(`${API_BASE}/jobs/manual`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Software Engineer', companyName: 'TechCorp' });
  expect(job.status).toBe(201);
  const jobId = job.body.data.id;

  const resume = await ResumeModel.create({
    userId: new Types.ObjectId(userId),
    originalFilename: 'resume.pdf',
    storedFilename: 'stored.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    storageKey: 'user/resume.pdf',
    status: 'ready',
    version: 3,
    isDefault: true,
  });

  const draft = await request(app).post(`${API_BASE}/applications`)
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId, resumeId: resume._id.toString() });
  expect(draft.status).toBe(201);

  return { app, token, userId, jobId, resumeId: resume._id.toString(), applicationId: draft.body.data.id };
}

const policyDouble = async (): Promise<PolicyEvaluation> => ({
  decision: 'auto_allowed',
  reasons: ['injected test policy'],
});

describe('SubmissionEngine persistence', () => {
  let replSet: MongoMemoryReplSet;
  let app: any;
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-minimum';
    const { resetConfigCache } = await import('../../src/config/index.js');
    resetConfigCache();
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri();
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = 'engine_test';
    app = createApp();
    await connectToDatabase();
    await SubmissionAttemptModel.syncIndexes();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await replSet.stop();
  });
  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await SubmissionAttemptModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
    }
  });

  it('creates persisted attempt for auto_allowed and is idempotent', async () => {
    const { token, userId, applicationId } = await seedEnvironment(app);
    const engine = new SubmissionEngine(policyDouble as any);
    const fp = 'fp-' + applicationId;

    const first = await engine.execute({
      userId,
      applicationId,
      platform: 'linkedin',
      idempotencyKey: 'key-1',
      materialsHash: fp,
    });
    expect(first.decision).toBe('auto_allowed');
    expect(first.attemptId).toBeDefined();
    expect(first.executionState).toBe('REQUESTED');

    const attempt = await SubmissionAttemptModel.findById(first.attemptId).lean();
    expect(attempt).toBeTruthy();
    expect((attempt as { userId: Types.ObjectId }).userId.toString()).toBe(userId);
    expect((attempt as { applicationId: Types.ObjectId }).applicationId.toString()).toBe(applicationId);

    const second = await engine.execute({
      userId,
      applicationId,
      platform: 'linkedin',
      idempotencyKey: 'key-1',
      materialsHash: fp,
    });
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.decision).toBe('auto_allowed');

    const count = await SubmissionAttemptModel.countDocuments({ userId, applicationId, idempotencyKey: 'key-1' }).exec();
    expect(count).toBe(1);
  });
});
