/** Focused regression: disabled platform must return `blocked` through both
 * `getJobReadiness` and `evaluateApplicationPolicy`, preserving the actual
 * configured platform mode (never coercing `disabled` into `permission`).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Types } from 'mongoose';
import { getJobReadiness, evaluateSubmissionPolicy } from '../../src/platforms/SubmissionPolicy.js';
import { evaluateApplicationPolicy } from '../../src/services/PlatformService.js';
import { getSubmissionSettings } from '../../src/services/PlatformService.js';
import { UserModel } from '../../src/models/index.js';
import { JobModel } from '../../src/models/Job.js';
import { ApplicationModel } from '../../src/models/Application.js';
import { SubmissionSettingsModel } from '../../src/models/SubmissionSettings.js';

describe('disabled platform readiness', () => {
  let mongo: MongoMemoryServer;
  const userId = new Types.ObjectId();
  const jobId = new Types.ObjectId();
  const applicationId = new Types.ObjectId();

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    process.env.MONGODB_DB = 'ai_job_application_agent_test';
    await mongoose.connect(mongo.getUri());
    await JobModel.syncIndexes();
    await ApplicationModel.syncIndexes();
    await SubmissionSettingsModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
    await JobModel.deleteMany({});
    await ApplicationModel.deleteMany({});
    await SubmissionSettingsModel.deleteMany({});

    await UserModel.create({
      _id: userId,
      email: 'disabled-platform@test.com',
      passwordHash: 'x',
    });
    await JobModel.create({
      _id: jobId,
      userId: userId.toString(),
      title: 'Engineer',
      companyName: 'Corp',
      remoteType: 'remote',
      employmentType: 'full_time',
      experienceLevel: 'mid',
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
      requiredSkills: [],
      preferredSkills: [],
      sources: [{ name: 'manual', discoveredAt: new Date() }],
      status: 'active',
      discoveredAt: new Date(),
    });
    await ApplicationModel.create({
      _id: applicationId,
      userId,
      jobId,
      jobSnapshot: { title: 'Engineer', companyName: 'Corp' },
      mode: 'auto',
      materials: { answers: [] },
      status: 'APPROVED',
      attemptCount: 0,
      isCancelled: false,
    });
  });

  it('getJobReadiness returns blocked for a disabled platform', async () => {
    await SubmissionSettingsModel.create({
      userId,
      globalPaused: false,
      dailyLimit: 10,
      minMatchScore: 80,
      platforms: [{ platform: 'linkedin', mode: 'disabled', authorized: false }],
    });

    const readiness = await getJobReadiness(userId, applicationId.toString(), 'linkedin');
    expect(readiness.decision).toBe('blocked');
    expect(readiness.policy.decision).toBe('blocked');
    expect(readiness.policy.reasons.join(' ')).toContain('disabled');
  });

  it('evaluateApplicationPolicy returns blocked for a disabled platform', async () => {
    await SubmissionSettingsModel.create({
      userId,
      globalPaused: false,
      dailyLimit: 10,
      minMatchScore: 80,
      platforms: [{ platform: 'linkedin', mode: 'disabled', authorized: false }],
    });

    const result = await evaluateApplicationPolicy(userId, applicationId.toString(), 'linkedin');
    expect(result.decision).toBe('blocked');
    expect(result.platform).toBe('linkedin');
    expect(result.reasons.join(' ')).toContain('disabled');
  });

  it('evaluateSubmissionPolicy preserves the configured disabled mode', async () => {
    const settings = await getSubmissionSettings(userId);
    // Seed settings explicitly so platformMode comes back as 'disabled', not 'permission'.
    await SubmissionSettingsModel.create({
      userId,
      globalPaused: false,
      dailyLimit: 10,
      minMatchScore: 80,
      platforms: [{ platform: 'linkedin', mode: 'disabled', authorized: true }],
    });
    const fresh = await getSubmissionSettings(userId);
    const platformSetting = fresh.platforms.find((p) => p.platform === 'linkedin');
    expect(platformSetting?.mode).toBe('disabled');

    const input = {
      platform: 'linkedin',
      platformKnown: true,
      capabilitySubmit: 'supported',
      adapterRegistered: true,
      applicationStatus: 'APPROVED' as const,
      applicationMode: 'auto' as const,
      matchScore: 90,
      matchEligible: true,
      unverifiedAnswerCount: 0,
      liveDuplicate: false,
      settings: {
        globalPaused: false,
        dailyLimit: 10,
        minMatchScore: 80,
        submissionsToday: 0,
        platformMode: 'disabled',
        platformAuthorized: true,
      },
    };
    expect(evaluateSubmissionPolicy(input).decision).toBe('blocked');
    // `disabled` is never converted into `permission`.
    expect(input.settings.platformMode).not.toBe('permission');
  });
});
