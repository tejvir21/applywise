/** Application management + approval workflow tests (Phase 6). No submissions. */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';
import { assertTransitionAllowed } from '../src/services/ApplicationService.js';

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

describe('Applications (Phase 6)', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;
  let user1Id: mongoose.Types.ObjectId;

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
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'app1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'app2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
    const user1 = await UserModel.findOne({ email: 'app1@test.com' }).exec();
    user1Id = user1!._id;
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
    const res = await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(PROFILE_PAYLOAD);
    expect(res.status).toBe(201);
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

  async function seedResume(): Promise<string> {
    const resume = await ResumeModel.create({
      userId: user1Id,
      originalFilename: 'resume.pdf',
      storedFilename: 'stored.pdf',
      mimeType: 'application/pdf',
      fileSize: 1234,
      storageKey: 'user/resume.pdf',
      status: 'ready',
      version: 3,
      isDefault: true,
    });
    return resume._id.toString();
  }

  function createDraft(token: string, body: Record<string, unknown>) {
    return request(app).post(`${API_BASE}/applications`).set(withAuth(token)).send(body);
  }

  describe('authentication', () => {
    it('rejects unauthenticated access to every application endpoint', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app).get(`${API_BASE}/applications`).expect(401);
      await request(app).post(`${API_BASE}/applications`).send({ jobId: fakeId }).expect(401);
      await request(app).get(`${API_BASE}/applications/${fakeId}`).expect(401);
      await request(app).get(`${API_BASE}/applications/${fakeId}/events`).expect(401);
      await request(app).patch(`${API_BASE}/applications/${fakeId}`).send({}).expect(401);
      await request(app).post(`${API_BASE}/applications/${fakeId}/request-review`).expect(401);
      await request(app).post(`${API_BASE}/applications/${fakeId}/approve`).send({ decision: 'approve' }).expect(401);
      await request(app).post(`${API_BASE}/applications/${fakeId}/cancel`).expect(401);
    });
  });

  describe('creation and validation', () => {
    it('creates a DRAFT with a match snapshot and job snapshot', async () => {
      const jobId = await createJob(user1Token, {
        title: 'Software Engineer',
        companyName: 'TechCorp',
        requiredSkills: [{ name: 'TypeScript', required: true }],
      });
      const res = await createDraft(user1Token, { jobId }).expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.mode).toBe('permission');
      expect(res.body.data.jobId).toBe(jobId);
      expect(res.body.data.jobSnapshot).toEqual({ title: 'Software Engineer', companyName: 'TechCorp' });
      expect(res.body.data.matchScore).toBeDefined();
      expect(res.body.data.matchExplanation).toBeDefined();
      expect(res.body.data.attemptCount).toBe(0);
      expect(mongoose.Types.ObjectId.isValid(res.body.data.id)).toBe(true);
    });

    it('rejects creation without a jobId and with a malformed jobId', async () => {
      const missing = await createDraft(user1Token, {}).expect(422);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');

      const malformed = await createDraft(user1Token, { jobId: 'not-an-id' }).expect(422);
      expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for nonexistent and other users’ jobs', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await createDraft(user1Token, { jobId: fakeId }).expect(404);

      const otherJob = await createJob(user2Token, { title: 'Hidden', companyName: 'Hidden Corp' });
      // user2 has no profile either, but job ownership is checked first
      const res = await createDraft(user1Token, { jobId: otherJob });
      expect(res.status).toBe(404);
    });

    it('returns 404 when the caller has no profile', async () => {
      const jobId = await createJob(user2Token, { title: 'Any', companyName: 'Any Corp' });
      await createDraft(user2Token, { jobId }).expect(404);
    });

    it('rejects unknown fields with a strict schema', async () => {
      const jobId = await createJob(user1Token);
      const res = await createDraft(user1Token, { jobId, hackerField: true }).expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('duplicate prevention', () => {
    it('returns 409 with the existing id on a second draft for the same job', async () => {
      const jobId = await createJob(user1Token);
      const first = await createDraft(user1Token, { jobId }).expect(201);
      const second = await createDraft(user1Token, { jobId }).expect(409);

      expect(second.body.success).toBe(false);
      expect(second.body.error.details.duplicateApplicationId).toBe(first.body.data.id);
    });

    it('resolves concurrent duplicate creates to one 201 and one 409', async () => {
      const jobId = await createJob(user1Token);
      const [a, b] = await Promise.all([
        createDraft(user1Token, { jobId }),
        createDraft(user1Token, { jobId }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const created = await ApplicationModel.countDocuments({ userId: user1Id, jobId }).exec();
      expect(created).toBe(1);
    });

    it('allows a fresh draft after cancelling', async () => {
      const jobId = await createJob(user1Token);
      const first = await createDraft(user1Token, { jobId }).expect(201);
      await request(app).post(`${API_BASE}/applications/${first.body.data.id}/cancel`).set(withAuth(user1Token)).expect(200);

      const second = await createDraft(user1Token, { jobId }).expect(201);
      expect(second.body.data.status).toBe('DRAFT');
    });
  });

  describe('draft updates', () => {
    it('updates permitted draft fields', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const created = await createDraft(user1Token, { jobId }).expect(201);

      const res = await request(app)
        .patch(`${API_BASE}/applications/${created.body.data.id}`)
        .set(withAuth(user1Token))
        .send({ resumeId, mode: 'auto', materials: { coverLetter: 'Hello', answers: [] } })
        .expect(200);

      expect(res.body.data.resumeId).toBe(resumeId);
      expect(res.body.data.resumeVersion).toBe(3);
      expect(res.body.data.mode).toBe('auto');
      expect(res.body.data.materials.coverLetter).toBe('Hello');
    });

    it('rejects edits once the draft has moved on', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(200);

      const res = await request(app)
        .patch(`${API_BASE}/applications/${created.body.data.id}`)
        .set(withAuth(user1Token))
        .send({ materials: { answers: [] } })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('never accepts a status change through the draft endpoint', async () => {
      const jobId = await createJob(user1Token);
      const created = await createDraft(user1Token, { jobId }).expect(201);

      // 'status' is not in the strict update schema
      await request(app)
        .patch(`${API_BASE}/applications/${created.body.data.id}`)
        .set(withAuth(user1Token))
        .send({ status: 'SUBMITTED' })
        .expect(422);
    });
  });

  describe('review, approval, and cancellation', () => {
    it('requires a resume before review', async () => {
      const jobId = await createJob(user1Token);
      const created = await createDraft(user1Token, { jobId }).expect(201);

      const res = await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires confirmation for unverified answers', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const created = await createDraft(user1Token, {
        jobId,
        resumeId,
        materials: { answers: [{ question: 'Work authorization?', answer: 'Yes', sensitive: true }] },
      }).expect(201);

      const denied = await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(422);
      expect(denied.body.error.details.unverifiedAnswers).toEqual(['Work authorization?']);

      const allowed = await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({ confirmUnverified: true })
        .expect(200);
      expect(allowed.body.data.status).toBe('AWAITING_APPROVAL');
      expect(allowed.body.data.unverifiedConfirmedAt).toBeDefined();
    });

    it('routes permission mode to approval and auto mode to ready-for-review', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const perm = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const permRes = await request(app)
        .post(`${API_BASE}/applications/${perm.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(200);
      expect(permRes.body.data.status).toBe('AWAITING_APPROVAL');

      const jobId2 = await createJob(user1Token, { title: 'Other', companyName: 'Other Corp' });
      const auto = await createDraft(user1Token, { jobId: jobId2, resumeId, mode: 'auto' }).expect(201);
      const autoRes = await request(app)
        .post(`${API_BASE}/applications/${auto.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(200);
      expect(autoRes.body.data.status).toBe('READY_FOR_REVIEW');
    });

    it('approves without submitting anything', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(200);

      const res = await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/approve`)
        .set(withAuth(user1Token))
        .send({ decision: 'approve', note: 'Looks good' })
        .expect(200);

      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.decisionNote).toBe('Looks good');
      expect(res.body.data.decidedAt).toBeDefined();
      // Approval is a decision record only: no submission attempt happened.
      expect(res.body.data.attemptCount).toBe(0);
      expect(res.body.data.lastAttemptAt).toBeUndefined();
    });

    it('rejects approval straight from DRAFT and rejects rejection paths honestly', async () => {
      const jobId = await createJob(user1Token);
      const created = await createDraft(user1Token, { jobId }).expect(201);

      await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/approve`)
        .set(withAuth(user1Token))
        .send({ decision: 'approve' })
        .expect(422);

      const resumeId = await seedResume();
      const jobId2 = await createJob(user1Token, { title: 'B', companyName: 'B Corp' });
      const full = await createDraft(user1Token, { jobId: jobId2, resumeId }).expect(201);
      await request(app)
        .post(`${API_BASE}/applications/${full.body.data.id}/request-review`)
        .set(withAuth(user1Token))
        .send({})
        .expect(200);
      const rejected = await request(app)
        .post(`${API_BASE}/applications/${full.body.data.id}/approve`)
        .set(withAuth(user1Token))
        .send({ decision: 'reject', note: 'Changed my mind' })
        .expect(200);
      expect(rejected.body.data.status).toBe('CANCELLED');
    });

    it('cancels from permitted states and refuses terminal ones', async () => {
      const jobId = await createJob(user1Token);
      const created = await createDraft(user1Token, { jobId }).expect(201);
      const cancelled = await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/cancel`)
        .set(withAuth(user1Token))
        .expect(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');

      await request(app)
        .post(`${API_BASE}/applications/${created.body.data.id}/cancel`)
        .set(withAuth(user1Token))
        .expect(422);
    });
  });

  describe('state machine policy', () => {
    it('rejects invalid and user-forbidden transitions', () => {
      expect(() => assertTransitionAllowed('DRAFT', 'APPROVED', 'user')).toThrow();
      expect(() => assertTransitionAllowed('DRAFT', 'SUBMITTED', 'user')).toThrow();
      expect(() => assertTransitionAllowed('APPROVED', 'SUBMITTING', 'user')).toThrow(/reserved for the submission engine/);
      expect(() => assertTransitionAllowed('SUBMITTED', 'DRAFT', 'user')).toThrow();
      expect(() => assertTransitionAllowed('CANCELLED', 'DRAFT', 'user')).toThrow();
      // System actor (future submission engine) may use the full map.
      expect(() => assertTransitionAllowed('APPROVED', 'SUBMITTING', 'system')).not.toThrow();
      expect(() => assertTransitionAllowed('SUBMITTING', 'SUBMITTED', 'system')).not.toThrow();
    });
  });

  describe('listing, ownership, and audit', () => {
    async function seedReviewedApp(token: string, title: string) {
      const jobId = await createJob(token, { title, companyName: `${title} Corp` });
      const created = await createDraft(token, { jobId }).expect(201);
      return created.body.data.id as string;
    }

    it('lists with status filters and pagination', async () => {
      const ids: string[] = [];
      for (const title of ['Alpha', 'Beta', 'Gamma']) {
        ids.push(await seedReviewedApp(user1Token, title));
      }
      await request(app).post(`${API_BASE}/applications/${ids[0]}/cancel`).set(withAuth(user1Token)).expect(200);

      const all = await request(app).get(`${API_BASE}/applications`).set(withAuth(user1Token)).expect(200);
      expect(all.body.data.total).toBe(3);

      const cancelled = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ status: 'CANCELLED' })
        .expect(200);
      expect(cancelled.body.data.total).toBe(1);

      const page = await request(app)
        .get(`${API_BASE}/applications`)
        .set(withAuth(user1Token))
        .query({ page: 1, pageSize: 2 })
        .expect(200);
      expect(page.body.data.applications).toHaveLength(2);
      expect(page.body.data.totalPages).toBe(2);
    });

    it('enforces ownership on every operation', async () => {
      const jobId = await createJob(user1Token);
      const created = await createDraft(user1Token, { jobId }).expect(201);
      const appId = created.body.data.id as string;

      await request(app).get(`${API_BASE}/applications/${appId}`).set(withAuth(user2Token)).expect(404);
      await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user2Token)).expect(404);
      await request(app).patch(`${API_BASE}/applications/${appId}`).set(withAuth(user2Token)).send({}).expect(404);
      await request(app).post(`${API_BASE}/applications/${appId}/request-review`).set(withAuth(user2Token)).send({}).expect(404);
      await request(app).post(`${API_BASE}/applications/${appId}/approve`).set(withAuth(user2Token)).send({ decision: 'approve' }).expect(404);
      await request(app).post(`${API_BASE}/applications/${appId}/cancel`).set(withAuth(user2Token)).expect(404);

      const otherList = await request(app).get(`${API_BASE}/applications`).set(withAuth(user2Token)).expect(200);
      expect(otherList.body.data.total).toBe(0);
    });

    it('records an ordered audit history', async () => {
      const jobId = await createJob(user1Token);
      const resumeId = await seedResume();
      const created = await createDraft(user1Token, { jobId, resumeId }).expect(201);
      const appId = created.body.data.id as string;
      await request(app).post(`${API_BASE}/applications/${appId}/request-review`).set(withAuth(user1Token)).send({}).expect(200);
      await request(app).post(`${API_BASE}/applications/${appId}/approve`).set(withAuth(user1Token)).send({ decision: 'approve' }).expect(200);

      const res = await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user1Token)).expect(200);
      const types = res.body.data.events.map((e: { type: string }) => e.type);
      expect(types).toEqual(['created', 'review_requested', 'approved']);
      expect(res.body.data.events[1]).toMatchObject({ fromStatus: 'DRAFT', toStatus: 'AWAITING_APPROVAL' });
      expect(res.body.data.events[2]).toMatchObject({ fromStatus: 'AWAITING_APPROVAL', toStatus: 'APPROVED' });
    });
  });
});
