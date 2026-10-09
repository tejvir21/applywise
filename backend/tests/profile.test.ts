/** Candidate profile + preferences route tests (Phase 8.1 P2). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const BASE_PROFILE = { firstName: 'Ada', lastName: 'Lovelace' };

describe('Profile (Phase 8.1)', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;

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
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'prof1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'prof2@test.com', password: 'password123' });
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
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  describe('authentication', () => {
    it('rejects anonymous profile access', async () => {
      await request(app).get(`${API_BASE}/profile`).expect(401);
      await request(app).post(`${API_BASE}/profile`).send(BASE_PROFILE).expect(401);
      await request(app).get(`${API_BASE}/profile/preferences`).expect(401);
      await request(app).get(`${API_BASE}/profile/completion`).expect(401);
    });
  });

  describe('CRUD', () => {
    it('creates, reads, replaces, patches, and deletes a profile', async () => {
      const created = await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send({
        ...BASE_PROFILE,
        headline: 'Engineer',
        yearsOfExperience: 5,
      }).expect(201);
      expect(created.body.data.firstName).toBe('Ada');
      expect(created.body.data.headline).toBe('Engineer');

      const fetched = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(fetched.body.data.lastName).toBe('Lovelace');

      const replaced = await request(app).put(`${API_BASE}/profile`).set(withAuth(user1Token)).send({
        ...BASE_PROFILE,
        currentJobTitle: 'Senior Engineer',
      }).expect(200);
      expect(replaced.body.data.currentJobTitle).toBe('Senior Engineer');

      const patched = await request(app).patch(`${API_BASE}/profile`).set(withAuth(user1Token)).send({ phone: '+1-555-0100' }).expect(200);
      expect(patched.body.data.phone).toBe('+1-555-0100');
      expect(patched.body.data.firstName).toBe('Ada');

      await request(app).delete(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(404);
    });

    it('rejects duplicate profiles and invalid payloads', async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);
      const dup = await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(409);
      expect(dup.body.success).toBe(false);

      const missing = await request(app).post(`${API_BASE}/profile`).set(withAuth(user2Token)).send({ firstName: 'NoLast' }).expect(422);
      expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('isolates profiles per user', async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);

      // user2 has no profile and cannot see user1's.
      await request(app).get(`${API_BASE}/profile`).set(withAuth(user2Token)).expect(404);
      await request(app).put(`${API_BASE}/profile`).set(withAuth(user2Token)).send(BASE_PROFILE).expect(404);
      // Delete is idempotent: missing profiles still return 200.
      await request(app).delete(`${API_BASE}/profile`).set(withAuth(user2Token)).expect(200);
    });

    it('reports completion', async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);
      const res = await request(app).get(`${API_BASE}/profile/completion`).set(withAuth(user1Token)).expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('preferences', () => {
    it('reads defaults and updates via PUT and PATCH', async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);

      const initial = await request(app).get(`${API_BASE}/profile/preferences`).set(withAuth(user1Token)).expect(200);
      expect(initial.body.success).toBe(true);

      const updated = await request(app)
        .put(`${API_BASE}/profile/preferences`)
        .set(withAuth(user1Token))
        .send({ desiredRoles: ['Engineer'], workMode: ['remote'], salaryMin: 100000, salaryMax: 150000 })
        .expect(200);
      expect(updated.body.data.desiredRoles).toContain('Engineer');

      const patched = await request(app)
        .patch(`${API_BASE}/profile/preferences`)
        .set(withAuth(user1Token))
        .send({ desiredRoles: ['Designer'] })
        .expect(200);
      expect(patched.body.data.desiredRoles).toContain('Designer');
    });

    it('validates preference ranges and enums', async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);

      const badRange = await request(app)
        .put(`${API_BASE}/profile/preferences`)
        .set(withAuth(user1Token))
        .send({ salaryMin: 200000, salaryMax: 100000 })
        .expect(422);
      expect(badRange.body.error.code).toBe('VALIDATION_ERROR');

      const badEnum = await request(app)
        .put(`${API_BASE}/profile/preferences`)
        .set(withAuth(user1Token))
        .send({ workMode: ['teleport'] })
        .expect(422);
      expect(badEnum.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('sub-collections', () => {
    beforeEach(async () => {
      await request(app).post(`${API_BASE}/profile`).set(withAuth(user1Token)).send(BASE_PROFILE).expect(201);
    });

    it('adds and removes skills', async () => {
      const added = await request(app)
        .post(`${API_BASE}/profile/skills`)
        .set(withAuth(user1Token))
        .send({ name: 'TypeScript', level: 'advanced' })
        .expect(201);
      const skillId = added.body.data.skills.at(-1)._id as string;
      expect(skillId).toBeDefined();

      const bad = await request(app)
        .post(`${API_BASE}/profile/skills`)
        .set(withAuth(user1Token))
        .send({ name: 'X', level: 'wizard' })
        .expect(422);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');

      await request(app).delete(`${API_BASE}/profile/skills/${skillId}`).set(withAuth(user1Token)).expect(200);
      const after = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(after.body.data.skills).toHaveLength(0);
    });

    it('adds and removes experience entries', async () => {
      const added = await request(app)
        .post(`${API_BASE}/profile/experience`)
        .set(withAuth(user1Token))
        .send({ company: 'TechCorp', jobTitle: 'Engineer', employmentType: 'full_time', startDate: '2020-01-01T00:00:00.000Z', current: true })
        .expect(201);
      const expId = added.body.data.experience.at(-1)._id as string;

      const badDates = await request(app)
        .post(`${API_BASE}/profile/experience`)
        .set(withAuth(user1Token))
        .send({ company: 'X', jobTitle: 'Y', employmentType: 'full_time', startDate: '2022-01-01T00:00:00.000Z', endDate: '2020-01-01T00:00:00.000Z', current: false })
        .expect(422);
      expect(badDates.body.error.code).toBe('VALIDATION_ERROR');

      await request(app).delete(`${API_BASE}/profile/experience/${expId}`).set(withAuth(user1Token)).expect(200);
    });

    it('adds and removes education, projects, and certifications', async () => {
      const edu = await request(app)
        .post(`${API_BASE}/profile/education`)
        .set(withAuth(user1Token))
        .send({ institution: 'State University', degree: 'BSc', startDate: '2016-09-01T00:00:00.000Z', current: true })
        .expect(201);
      await request(app).delete(`${API_BASE}/profile/education/${edu.body.data.education.at(-1)._id}`).set(withAuth(user1Token)).expect(200);

      const proj = await request(app)
        .post(`${API_BASE}/profile/projects`)
        .set(withAuth(user1Token))
        .send({ name: 'Side Project' })
        .expect(201);
      await request(app).delete(`${API_BASE}/profile/projects/${proj.body.data.projects.at(-1)._id}`).set(withAuth(user1Token)).expect(200);

      const cert = await request(app)
        .post(`${API_BASE}/profile/certifications`)
        .set(withAuth(user1Token))
        .send({ name: 'AWS SAA', issuingOrganization: 'Amazon', issueDate: '2023-01-01T00:00:00.000Z' })
        .expect(201);
      await request(app).delete(`${API_BASE}/profile/certifications/${cert.body.data.certifications.at(-1)._id}`).set(withAuth(user1Token)).expect(200);

      const after = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(after.body.data.education).toHaveLength(0);
      expect(after.body.data.projects).toHaveLength(0);
      expect(after.body.data.certifications).toHaveLength(0);
    });

    it('rejects malformed sub-resource IDs', async () => {
      const res = await request(app).delete(`${API_BASE}/profile/skills/not-an-id`).set(withAuth(user1Token));
      expect([400, 404, 422]).toContain(res.status);
    });
  });
});
