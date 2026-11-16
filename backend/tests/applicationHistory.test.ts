/**
 * Application history, search, summary metrics, and outcome-truthfulness
 * tests.
 *
 * These cover the workflow guarantees the UI depends on:
 * - history shows real fields (created/updated, next action, source)
 * - status filters and free-text search
 * - dashboard-style counts computed without double counting, and never
 *   counting a draft as a submission
 * - the difference between a draft, an external handoff, and a confirmed
 *   submission is preserved end to end
 * - ownership is enforced on the summary endpoint too
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';
import { nextActionForStatus } from '../src/services/ApplicationService.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const PROFILE_PAYLOAD = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  skills: [{ name: 'TypeScript' }, { name: 'Node.js' }],
  yearsOfExperience: 5,
  currentJobTitle: 'Software Engineer',
  jobPreferences: {
    desiredRoles: ['Software Engineer'],
    workMode: ['remote', 'hybrid'],
    employmentTypes: ['full_time'],
  },
};

describe('Application history and summary', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;
  let resumeId: string;

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
    }
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'hist1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'hist2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
    }
    await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(PROFILE_PAYLOAD);

    // user2 needs a profile before drafts can be created for their own jobs.
    await request(app)
      .post(`${API_BASE}/profile`)
      .set(withAuth(user2Token))
      .send({ ...PROFILE_PAYLOAD, firstName: 'Grace', lastName: 'Hopper' })
      .expect(201);

    const user1 = await UserModel.findOne({ email: 'hist1@test.com' }).exec();
    const resume = await ResumeModel.create({
      userId: user1!._id,
      originalFilename: 'resume.pdf',
      storedFilename: 'stored.pdf',
      mimeType: 'application/pdf',
      fileSize: 1234,
      storageKey: 'user/resume.pdf',
      status: 'ready',
      version: 1,
      isDefault: true,
    });
    resumeId = resume._id.toString();
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createJob(token: string, payload: Record<string, unknown> = { title: 'Dev', companyName: 'Corp' }) {
    const res = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  function createDraft(token: string, body: Record<string, unknown>) {
    return request(app).post(`${API_BASE}/applications`).set(withAuth(token)).send(body);
  }

  /** Drive a draft all the way to APPROVED (a decision, never a submission). */
  async function approveDraft(appId: string, token = user1Token) {
    await request(app).post(`${API_BASE}/applications/${appId}/request-review`).set(withAuth(token)).send({}).expect(200);
    await request(app)
      .post(`${API_BASE}/applications/${appId}/approve`)
      .set(withAuth(token))
      .send({ decision: 'approve', note: 'looks good' })
      .expect(200);
  }

  describe('authentication and ownership', () => {
    it('rejects unauthenticated history and summary access', async () => {
      await request(app).get(`${API_BASE}/applications`).expect(401);
      await request(app).get(`${API_BASE}/applications/summary`).expect(401);
    });

    it('scopes the summary to the calling user', async () => {
      const jobId = await createJob(user1Token);
      await createDraft(user1Token, { jobId, resumeId }).expect(201);

      const own = await request(app).get(`${API_BASE}/applications/summary`).set(withAuth(user1Token)).expect(200);
      expect(own.body.data.total).toBe(1);

      const other = await request(app).get(`${API_BASE}/applications/summary`).set(withAuth(user2Token)).expect(200);
      expect(other.body.data.total).toBe(0);
      expect(other.body.data.recentActivity).toHaveLength(0);
    });
  });

  describe('history rows', () => {
    it('returns job, company, status, timestamps, and a next action', async () => {
      const jobId = await createJob(user1Token, {
        title: 'Backend Engineer',
        companyName: 'Acme Labs',
        applicationUrl: 'https://jobs.example.com/acme/backend',
      });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);

      const res = await request(app)
        .get(`${API_BASE}/applications/${created.body.data.id}`)
        .set(withAuth(user1Token))
        .expect(200);

      const data = res.body.data;
      expect(data.jobSnapshot.title).toBe('Backend Engineer');
      expect(data.jobSnapshot.companyName).toBe('Acme Labs');
      expect(data.status).toBe('DRAFT');
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(Date.parse(data.createdAt)).not.toBeNaN();
      expect(data.nextAction).toBe('Review materials and request review');
      // A draft must never present itself as submitted.
      expect(data.status).not.toBe('SUBMITTED');
      expect(data.attemptCount).toBe(0);
    });

    it('advances the next action as the workflow progresses', async () => {
      const jobId = await createJob(user1Token, {
        title: 'Handoff Engineer',
        companyName: 'Acme Labs',
        applicationUrl: 'https://jobs.example.com/acme/handoff',
      });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const appId = created.body.data.id as string;

      await request(app).post(`${API_BASE}/applications/${appId}/request-review`).set(withAuth(user1Token)).send({}).expect(200);
      const awaiting = await request(app).get(`${API_BASE}/applications/${appId}`).set(withAuth(user1Token)).expect(200);
      expect(awaiting.body.data.status).toBe('AWAITING_APPROVAL');
      expect(awaiting.body.data.nextAction).toContain('approval');

      await request(app).post(`${API_BASE}/applications/${appId}/approve`).set(withAuth(user1Token)).send({ decision: 'approve' }).expect(200);
      const approved = await request(app).get(`${API_BASE}/applications/${appId}`).set(withAuth(user1Token)).expect(200);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(approved.body.data.nextAction).toMatch(/hand off/i);
      // Approval is a decision, not a submission.
      expect(approved.body.data.status).not.toBe('SUBMITTED');
    });
  });

  describe('status filtering and search', () => {
    beforeEach(async () => {
      const alpha = await createJob(user1Token, { title: 'Alpha Platform Engineer', companyName: 'Acme Labs' });
      const beta = await createJob(user1Token, { title: 'Beta Designer', companyName: 'DesignHub' });
      await createDraft(user1Token, { jobId: alpha, resumeId }).expect(201);
      const betaDraft = await createDraft(user1Token, { jobId: beta, resumeId }).expect(201);
      await request(app).post(`${API_BASE}/applications/${betaDraft.body.data.id}/cancel`).set(withAuth(user1Token)).expect(200);
    });

    it('filters by status', async () => {
      const draft = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ status: 'DRAFT' })
        .expect(200);
      expect(draft.body.data.total).toBe(1);
      expect(draft.body.data.applications[0].status).toBe('DRAFT');

      const cancelled = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ status: 'CANCELLED' })
        .expect(200);
      expect(cancelled.body.data.total).toBe(1);
      expect(cancelled.body.data.applications[0].status).toBe('CANCELLED');
    });

    it('searches job title and company case-insensitively', async () => {
      const byTitle = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: 'alpha' })
        .expect(200);
      expect(byTitle.body.data.total).toBe(1);
      expect(byTitle.body.data.applications[0].jobSnapshot.title).toBe('Alpha Platform Engineer');

      const byCompany = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: 'designhub' })
        .expect(200);
      expect(byCompany.body.data.total).toBe(1);
      expect(byCompany.body.data.applications[0].jobSnapshot.companyName).toBe('DesignHub');

      const noMatch = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: 'nothing-here' })
        .expect(200);
      expect(noMatch.body.data.total).toBe(0);
    });

    it('treats search input as a literal, not a regex', async () => {
      const res = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: '.*' })
        .expect(200);
      // '.*' must not match everything.
      expect(res.body.data.total).toBe(0);
    });

    it('combines search with status filter', async () => {
      const res = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: 'acme', status: 'CANCELLED' })
        .expect(200);
      expect(res.body.data.total).toBe(0);

      const hit = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ search: 'acme', status: 'DRAFT' })
        .expect(200);
      expect(hit.body.data.total).toBe(1);
    });
  });

  describe('summary metrics', () => {
    it('counts statuses exactly without double counting', async () => {
      // Two drafts, one approved, one cancelled, one external handoff.
      const draftA = await createJob(user1Token, { title: 'Draft A', companyName: 'Corp A', applicationUrl: 'https://example.com/a' });
      const draftB = await createJob(user1Token, { title: 'Draft B', companyName: 'Corp B', applicationUrl: 'https://example.com/b' });
      const approvedJob = await createJob(user1Token, { title: 'Approved', companyName: 'Corp C', applicationUrl: 'https://example.com/c' });
      const cancelledJob = await createJob(user1Token, { title: 'Cancelled', companyName: 'Corp D' });

      await createDraft(user1Token, { jobId: draftA, resumeId }).expect(201);
      await createDraft(user1Token, { jobId: draftB, resumeId }).expect(201);
      const approved = await createDraft(user1Token, { jobId: approvedJob, resumeId }).expect(201);
      await approveDraft(approved.body.data.id);
      const cancelled = await createDraft(user1Token, { jobId: cancelledJob, resumeId }).expect(201);
      await request(app).post(`${API_BASE}/applications/${cancelled.body.data.id}/cancel`).set(withAuth(user1Token)).expect(200);

      const res = await request(app).get(`${API_BASE}/applications/summary`).set(withAuth(user1Token)).expect(200);
      const data = res.body.data;

      expect(data.total).toBe(4);
      expect(data.drafts).toBe(2);
      expect(data.approved).toBe(1);
      expect(data.cancelled).toBe(1);
      expect(data.awaitingReview).toBe(0);
      // Nothing was submitted: drafts and approvals must not inflate this.
      expect(data.confirmedSubmissions).toBe(0);
      expect(data.externalHandoffs).toBe(0);

      // Buckets partition the set: no application counted twice or dropped.
      const bucketSum = Object.values(data.byStatus as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(bucketSum).toBe(data.total);
    });

    it('counts a completed handoff separately from a confirmed submission', async () => {
      const jobId = await createJob(user1Token, {
        title: 'Platform Engineer',
        companyName: 'Acme',
        applicationUrl: 'https://jobs.example.com/apply/1',
      });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const appId = created.body.data.id as string;
      await approveDraft(appId);

      const handoff = await request(app).post(`${API_BASE}/applications/${appId}/handoff`).set(withAuth(user1Token)).expect(200);
      expect(handoff.body.data.application.status).toBe('NEEDS_MANUAL_ACTION');
      expect(handoff.body.data.handoff.applicationUrl).toBe('https://jobs.example.com/apply/1');
      expect(Array.isArray(handoff.body.data.handoff.instructions)).toBe(true);

      const summary = await request(app).get(`${API_BASE}/applications/summary`).set(withAuth(user1Token)).expect(200);
      // The handoff is real; the submission is not confirmed by this system.
      expect(summary.body.data.externalHandoffs).toBe(1);
      expect(summary.body.data.confirmedSubmissions).toBe(0);
      expect(summary.body.data.approved).toBe(0);
    });

    it('returns zeroed metrics and no activity for a user with nothing', async () => {
      const res = await request(app).get(`${API_BASE}/applications/summary`).set(withAuth(user2Token)).expect(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.drafts).toBe(0);
      expect(res.body.data.confirmedSubmissions).toBe(0);
      expect(res.body.data.recentActivity).toEqual([]);
    });

    it('reports recent activity newest first with timestamps', async () => {
      const jobId = await createJob(user1Token, { title: 'Activity Job', companyName: 'Corp' });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      await approveDraft(created.body.data.id);

      const res = await request(app)
        .get(`${API_BASE}/applications/summary`)
        .set(withAuth(user1Token))
        .query({ recentLimit: 10 })
        .expect(200);

      const activity = res.body.data.recentActivity as Array<{ type: string; createdAt: string; message?: string }>;
      expect(activity.length).toBeGreaterThanOrEqual(3);
      expect(activity[0].type).toBe('approved');
      // Timestamps must be parseable and monotonically non-increasing.
      const times = activity.map((a) => Date.parse(a.createdAt));
      expect(times.every((t) => !Number.isNaN(t))).toBe(true);
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
      // Messages are meaningful, not empty.
      expect(activity.some((a) => Boolean(a.message))).toBe(true);
    });

    it('bounds recentLimit and rejects out-of-range values', async () => {
      await request(app)
        .get(`${API_BASE}/applications/summary`)
        .set(withAuth(user1Token))
        .query({ recentLimit: 500 })
        .expect(422);
    });
  });

  describe('outcome truthfulness', () => {
    it('never records a submission when a draft is created or approved', async () => {
      const jobId = await createJob(user1Token, { title: 'Truth Test', companyName: 'Corp', applicationUrl: 'https://example.com/t' });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const appId = created.body.data.id as string;
      await approveDraft(appId);

      const events = await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user1Token)).expect(200);
      const types = events.body.data.events.map((e: { type: string }) => e.type);
      expect(types).toEqual(['created', 'review_requested', 'approved']);
      expect(types).not.toContain('submission_confirmed');
      expect(types).not.toContain('submitted');

      const record = await ApplicationModel.findById(appId).lean().exec();
      expect(record!.status).toBe('APPROVED');
      expect(record!.attemptCount).toBe(0);
      expect(record!.lastError).toBeUndefined();
    });

    it('records a handoff event that explicitly says nothing was submitted', async () => {
      const jobId = await createJob(user1Token, { title: 'Handoff Test', companyName: 'Corp', applicationUrl: 'https://example.com/h' });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const appId = created.body.data.id as string;
      await approveDraft(appId);
      await request(app).post(`${API_BASE}/applications/${appId}/handoff`).set(withAuth(user1Token)).expect(200);

      const events = await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user1Token)).expect(200);
      const handoff = events.body.data.events.find((e: { type: string }) => e.type === 'handoff_opened');
      expect(handoff).toBeDefined();
      expect(handoff.message).toMatch(/nothing submitted/i);
      expect(handoff.toStatus).toBe('NEEDS_MANUAL_ACTION');
    });

    it('refuses handoff without an application URL', async () => {
      const jobId = await createJob(user1Token, { title: 'No URL Job', companyName: 'Corp' });
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      await approveDraft(created.body.data.id);

      const res = await request(app).post(`${API_BASE}/applications/${created.body.data.id}/handoff`).set(withAuth(user1Token));
      // ValidationError -> 422: there is no authorized destination to hand off to.
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe('nextActionForStatus', () => {
    it('never implies a submission for non-submitted states', () => {
      const draft = nextActionForStatus('DRAFT');
      expect(draft).not.toMatch(/submitted/i);

      const approved = nextActionForStatus('APPROVED');
      expect(approved).not.toMatch(/submitted/i);
      expect(approved).toMatch(/hand off/i);

      const handoff = nextActionForStatus('NEEDS_MANUAL_ACTION');
      expect(handoff).not.toMatch(/submitted/i);

      expect(nextActionForStatus('SUBMITTED')).toMatch(/submitted/i);
    });
  });
});