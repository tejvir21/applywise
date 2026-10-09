/** Platform capabilities, submission policy, settings, and handoff tests (Phase 8). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';
import { SubmissionSettingsModel } from '../src/models/SubmissionSettings.js';
import {
  PLATFORMS,
  CAPABILITY_KEYS,
  getPlatform,
  isSubmissionSupported,
} from '../src/platforms/PlatformCapabilities.js';
import { submissionRegistry } from '../src/platforms/SubmissionAdapter.js';
import { MockSubmissionAdapter } from '../src/platforms/MockSubmissionAdapter.js';
import {
  evaluateSubmissionPolicy,
  defaultPolicySettings,
  type PolicyInput,
} from '../src/platforms/SubmissionPolicy.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function basePolicyInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    platform: 'linkedin',
    platformKnown: true,
    capabilitySubmit: 'unsupported',
    adapterRegistered: false,
    applicationStatus: 'APPROVED',
    applicationMode: 'permission',
    matchScore: 90,
    matchEligible: true,
    unverifiedAnswerCount: 0,
    liveDuplicate: false,
    settings: { ...defaultPolicySettings() },
    ...overrides,
  };
}

describe('platform capability registry', () => {
  it('covers every requested platform with all eight capabilities assessed', () => {
    const names = PLATFORMS.map((p) => p.platform);
    for (const expected of ['linkedin', 'indeed', 'naukri', 'apna', 'wellfound', 'career-site']) {
      expect(names).toContain(expected);
    }
    for (const platform of PLATFORMS) {
      for (const key of CAPABILITY_KEYS) {
        expect(['supported', 'unsupported', 'unverified', 'unavailable']).toContain(platform.capabilities[key].status);
      }
      expect(platform.lastReviewed).toBeTruthy();
    }
  });

  it('never reports submission as supported — discovery implies nothing', () => {
    for (const platform of PLATFORMS) {
      expect(isSubmissionSupported(platform.platform)).toBe(false);
      expect(platform.capabilities.submit.status).not.toBe('supported');
    }
    expect(isSubmissionSupported('no-such-platform')).toBe(false);
    expect(getPlatform('no-such-platform')).toBeUndefined();
  });

  it('supports user handoff everywhere and documents researched evidence', () => {
    for (const platform of PLATFORMS) {
      expect(platform.capabilities.handoff.status).toBe('supported');
    }
    const linkedin = getPlatform('linkedin')!;
    expect(linkedin.capabilities.discovery.evidence).toContain('learn.microsoft.com');
    const indeed = getPlatform('indeed')!;
    expect(indeed.capabilities.submit.evidence).toContain('robots.txt');
  });

  it('marks unassessed capabilities unverified rather than assuming', () => {
    expect(getPlatform('apna')!.capabilities.discovery.status).toBe('unverified');
  });
});

describe('submission adapters', () => {
  it('starts empty: no real submission privileges exist', () => {
    expect(submissionRegistry.get('linkedin')).toBeUndefined();
    expect(submissionRegistry.get('mock-submit')).toBeUndefined();
  });

  it('mock adapter is explicitly labeled and deterministic', async () => {
    const adapter = new MockSubmissionAdapter();
    expect(adapter.isMock).toBe(true);
    expect(adapter.displayName).toContain('MOCK');

    adapter.scriptOutcome('k-success', 'submitted');
    adapter.scriptOutcome('k-rejected', 'rejected');
    adapter.scriptOutcome('k-failed', 'failed');
    adapter.scriptOutcome('k-manual', 'manual_required');

    const ok = await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k-success' });
    expect(ok.mock).toBe(true);
    expect(ok.outcome).toBe('submitted');
    expect(ok.confirmationId).toContain('mock-conf-');
    expect((await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k-rejected' })).outcome).toBe('rejected');
    expect((await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k-failed' })).outcome).toBe('failed');
    expect((await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k-manual' })).outcome).toBe('manual_required');
  });

  it('mock adapter replays idempotent retries without duplicating', async () => {
    const adapter = new MockSubmissionAdapter();
    const first = await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k1' });
    const second = await adapter.submit({ applicationId: 'a', jobUrl: 'https://x', answers: [], documentIds: [], idempotencyKey: 'k1' });
    expect(second.confirmationId).toBe(first.confirmationId);
    expect(second.message).toContain('idempotent replay');
    expect(await adapter.verify(first.confirmationId!)).toMatchObject({ mock: true, status: 'confirmed' });
    expect(await adapter.verify('mock-conf-unknown')).toMatchObject({ status: 'not_found' });
  });
});

describe('submission policy evaluation (pure)', () => {
  it('fails closed on unknown or unverified platforms', () => {
    expect(evaluateSubmissionPolicy(basePolicyInput({ platformKnown: false })).decision).toBe('blocked');
    expect(evaluateSubmissionPolicy(basePolicyInput({ capabilitySubmit: 'unverified' })).decision).toBe('blocked');
    expect(evaluateSubmissionPolicy(basePolicyInput({ capabilitySubmit: undefined })).decision).toBe('blocked');
  });

  it('blocks on global pause, disabled platform, duplicates, and spent budgets', () => {
    expect(evaluateSubmissionPolicy(basePolicyInput({ settings: { ...defaultPolicySettings(), globalPaused: true } })).decision).toBe('blocked');
    expect(evaluateSubmissionPolicy(basePolicyInput({ settings: { ...defaultPolicySettings(), platformMode: 'disabled' } })).decision).toBe('blocked');
    expect(evaluateSubmissionPolicy(basePolicyInput({ liveDuplicate: true })).decision).toBe('blocked');
    expect(
      evaluateSubmissionPolicy(basePolicyInput({ settings: { ...defaultPolicySettings(), dailyLimit: 1, submissionsToday: 1 } })).decision,
    ).toBe('blocked');
  });

  it('routes unsupported submission to manual handoff, never auto', () => {
    const unsupported = evaluateSubmissionPolicy(basePolicyInput({ capabilitySubmit: 'unsupported' }));
    expect(unsupported.decision).toBe('manual_only');
    const unavailable = evaluateSubmissionPolicy(basePolicyInput({ platform: 'wellfound', capabilitySubmit: 'unavailable' }));
    expect(unavailable.decision).toBe('manual_only');
    const noAdapter = evaluateSubmissionPolicy(basePolicyInput({ capabilitySubmit: 'supported', adapterRegistered: false }));
    expect(noAdapter.decision).toBe('manual_only');
  });

  it('requires approval for soft gates even on supported paths', () => {
    const supported = { capabilitySubmit: 'supported', adapterRegistered: true } as const;
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, matchScore: 10 })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, matchScore: null })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, matchEligible: false })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, unverifiedAnswerCount: 2 })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, applicationMode: 'permission' })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, settings: { ...defaultPolicySettings(), platformMode: 'permission' } })).decision).toBe('approval_required');
    expect(evaluateSubmissionPolicy(basePolicyInput({ ...supported, settings: { ...defaultPolicySettings(), platformMode: 'auto', platformAuthorized: false } })).decision).toBe('approval_required');
  });

  it('allows automatic submission only when every condition holds', () => {
    const result = evaluateSubmissionPolicy(
      basePolicyInput({
        platform: 'verified-partner',
        capabilitySubmit: 'supported',
        adapterRegistered: true,
        applicationMode: 'auto',
        settings: { ...defaultPolicySettings(), platformMode: 'auto', platformAuthorized: true },
      }),
    );
    expect(result.decision).toBe('auto_allowed');
  });
});

describe('platform + policy + handoff API', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;
  let user1Id: mongoose.Types.ObjectId;

  const PROFILE_PAYLOAD = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    skills: [{ name: 'TypeScript' }],
    yearsOfExperience: 5,
    jobPreferences: { desiredRoles: ['Engineer'], workMode: ['remote'] },
  };

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
      await SubmissionSettingsModel.deleteMany({}).exec();
    }
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'plat1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'plat2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
    user1Id = (await UserModel.findOne({ email: 'plat1@test.com' }).exec())!._id;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
      await SubmissionSettingsModel.deleteMany({}).exec();
    }
    const res = await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(PROFILE_PAYLOAD);
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function approvedAppWithUrl(token: string, applicationUrl?: string): Promise<{ appId: string; jobId: string }> {
    const job = await request(app)
      .post(`${API_BASE}/jobs/manual`)
      .set(withAuth(token))
      .send({ title: 'Engineer', companyName: 'Corp', ...(applicationUrl ? { applicationUrl } : {}) });
    expect(job.status).toBe(201);
    const draft = await request(app).post(`${API_BASE}/applications`).set(withAuth(token)).send({ jobId: job.body.data.id });
    expect(draft.status).toBe(201);
    const resume = await ResumeModel.create({
      userId: user1Id, originalFilename: 'r.pdf', storedFilename: 's.pdf',
      mimeType: 'application/pdf', fileSize: 10, storageKey: 'k', status: 'ready',
    });
    await request(app).patch(`${API_BASE}/applications/${draft.body.data.id}`).set(withAuth(token)).send({ resumeId: resume._id.toString() }).expect(200);
    await request(app).post(`${API_BASE}/applications/${draft.body.data.id}/request-review`).set(withAuth(token)).send({}).expect(200);
    await request(app).post(`${API_BASE}/applications/${draft.body.data.id}/approve`).set(withAuth(token)).send({ decision: 'approve' }).expect(200);
    return { appId: draft.body.data.id as string, jobId: job.body.data.id as string };
  }

  it('rejects unauthenticated platform and settings access', async () => {
    await request(app).get(`${API_BASE}/platforms`).expect(401);
    await request(app).get(`${API_BASE}/platforms/linkedin`).expect(401);
    await request(app).get(`${API_BASE}/platforms/settings/submission`).expect(401);
    await request(app).put(`${API_BASE}/platforms/settings/submission`).send({}).expect(401);
  });

  it('serves the researched capability matrix', async () => {
    const res = await request(app).get(`${API_BASE}/platforms`).set(withAuth(user1Token)).expect(200);
    expect(res.body.data.platforms).toHaveLength(6);
    for (const platform of res.body.data.platforms as Array<{ capabilities: Record<string, { status: string }> }>) {
      expect(platform.capabilities.submit.status).not.toBe('supported');
      expect(platform.capabilities.handoff.status).toBe('supported');
    }

    const linkedin = await request(app).get(`${API_BASE}/platforms/linkedin`).set(withAuth(user1Token)).expect(200);
    expect(linkedin.body.data.capabilities.submit.status).toBe('unsupported');

    await request(app).get(`${API_BASE}/platforms/myspace`).set(withAuth(user1Token)).expect(404);
  });

  it('manages user-scoped submission settings with validation', async () => {
    const defaults = await request(app).get(`${API_BASE}/platforms/settings/submission`).set(withAuth(user1Token)).expect(200);
    expect(defaults.body.data).toMatchObject({ globalPaused: false, dailyLimit: 10, minMatchScore: 80, platforms: [] });

    const updated = await request(app)
      .put(`${API_BASE}/platforms/settings/submission`)
      .set(withAuth(user1Token))
      .send({ globalPaused: true, dailyLimit: 3, platforms: [{ platform: 'linkedin', mode: 'auto', authorized: false }] })
      .expect(200);
    expect(updated.body.data).toMatchObject({ globalPaused: true, dailyLimit: 3 });
    expect(updated.body.data.platforms).toHaveLength(1);

    await request(app).put(`${API_BASE}/platforms/settings/submission`).set(withAuth(user1Token)).send({ dailyLimit: 0 }).expect(422);
    await request(app).put(`${API_BASE}/platforms/settings/submission`).set(withAuth(user1Token)).send({ minMatchScore: 101 }).expect(422);

    // Settings are per-user singletons.
    const other = await request(app).get(`${API_BASE}/platforms/settings/submission`).set(withAuth(user2Token)).expect(200);
    expect(other.body.data).toMatchObject({ globalPaused: false, dailyLimit: 10 });
  });

  it('evaluates policy per application without changing state', async () => {
    const { appId } = await approvedAppWithUrl(user1Token, 'https://example.com/apply/1');

    const linkedin = await request(app)
      .post(`${API_BASE}/applications/${appId}/policy`)
      .set(withAuth(user1Token))
      .send({ platform: 'linkedin' })
      .expect(200);
    expect(linkedin.body.data.decision).toBe('manual_only');
    expect(linkedin.body.data.platform).toBe('linkedin');

    const unknown = await request(app)
      .post(`${API_BASE}/applications/${appId}/policy`)
      .set(withAuth(user1Token))
      .send({ platform: 'no-such-platform' })
      .expect(200);
    expect(unknown.body.data.decision).toBe('blocked');

    await request(app).post(`${API_BASE}/applications/${appId}/policy`).set(withAuth(user1Token)).send({}).expect(422);

    // Evaluation changes nothing.
    const current = await request(app).get(`${API_BASE}/applications/${appId}`).set(withAuth(user1Token)).expect(200);
    expect(current.body.data.status).toBe('APPROVED');

    await request(app).post(`${API_BASE}/applications/${appId}/policy`).set(withAuth(user2Token)).send({ platform: 'linkedin' }).expect(404);
  });

  it('blocks on global pause and spent daily budgets', async () => {
    const { appId } = await approvedAppWithUrl(user1Token, 'https://example.com/apply/2');

    await request(app).put(`${API_BASE}/platforms/settings/submission`).set(withAuth(user1Token)).send({ globalPaused: true }).expect(200);
    const paused = await request(app).post(`${API_BASE}/applications/${appId}/policy`).set(withAuth(user1Token)).send({ platform: 'linkedin' }).expect(200);
    expect(paused.body.data.decision).toBe('blocked');

    await request(app).put(`${API_BASE}/platforms/settings/submission`).set(withAuth(user1Token)).send({ globalPaused: false, dailyLimit: 1 }).expect(200);
    await ApplicationEventModel.create({ applicationId: new mongoose.Types.ObjectId(appId), userId: user1Id, type: 'submission_attempted' });
    const spent = await request(app).post(`${API_BASE}/applications/${appId}/policy`).set(withAuth(user1Token)).send({ platform: 'indeed' }).expect(200);
    expect(spent.body.data.decision).toBe('blocked');
    expect(spent.body.data.reasons.join(' ')).toContain('Daily submission limit reached');
  });

  it('hands off approved applications without ever marking them submitted', async () => {
    const { appId } = await approvedAppWithUrl(user1Token, 'https://example.com/apply/3');

    const res = await request(app).post(`${API_BASE}/applications/${appId}/handoff`).set(withAuth(user1Token)).expect(200);
    expect(res.body.data.handoff.applicationUrl).toBe('https://example.com/apply/3');
    expect(res.body.data.handoff.instructions.length).toBeGreaterThan(0);
    expect(res.body.data.application.status).toBe('NEEDS_MANUAL_ACTION');
    expect(res.body.data.application.status).not.toBe('SUBMITTED');

    const events = await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user1Token)).expect(200);
    expect(events.body.data.events.map((e: { type: string }) => e.type)).toContain('handoff_opened');

    // Repeat handoff is a stable no-op, not an error or a duplicate transition.
    const again = await request(app).post(`${API_BASE}/applications/${appId}/handoff`).set(withAuth(user1Token)).expect(200);
    expect(again.body.data.application.status).toBe('NEEDS_MANUAL_ACTION');
  });

  it('refuses handoff for non-approved applications and jobs without URLs', async () => {
    const job = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(user1Token)).send({ title: 'No URL', companyName: 'Corp' });
    expect(job.status).toBe(201);
    const draft = await request(app).post(`${API_BASE}/applications`).set(withAuth(user1Token)).send({ jobId: job.body.data.id });
    expect(draft.status).toBe(201);
    await request(app).post(`${API_BASE}/applications/${draft.body.data.id}/handoff`).set(withAuth(user1Token)).expect(422);

    const { appId } = await approvedAppWithUrl(user1Token);
    await request(app).post(`${API_BASE}/applications/${appId}/handoff`).set(withAuth(user1Token)).expect(422);

    await request(app).post(`${API_BASE}/applications/${draft.body.data.id}/handoff`).set(withAuth(user2Token)).expect(404);
  });
});
