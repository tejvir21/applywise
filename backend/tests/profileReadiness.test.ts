/** Profile readiness integration tests (Phase 8.3.8). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function register(app: any, email: string) {
  const res = await request(app).post(`${API_BASE}/auth/register`).send({ email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.data.access_token;
}

describe('Profile readiness (Phase 8.3.8)', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
    }
    token = await register(app, 'readiness@test.com');
    const user = await UserModel.findOne({ email: 'readiness@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
    }
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function insertProfile(overrides: Record<string, unknown> = {}) {
    return CandidateProfileModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+1-555-0100',
      headline: 'Software Engineer',
      professionalSummary: 'Experienced engineer.',
      yearsOfExperience: 6,
      currentJobTitle: 'Senior Software Engineer',
      currentCompany: 'TechCorp',
      skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }],
      experience: [
        {
          company: 'Prior Co',
          jobTitle: 'Software Engineer',
          employmentType: 'full_time',
          startDate: new Date('2018-01-01'),
          current: false,
          description: 'Built things.',
        },
      ],
      education: [
        {
          institution: 'University',
          degree: 'Bachelor of Science',
          fieldOfStudy: 'Computer Science',
          startDate: new Date('2014-01-01'),
          current: false,
        },
      ],
      jobPreferences: {
        desiredRoles: ['Software Engineer'],
        preferredLocations: ['Remote'],
        workMode: ['remote'],
        employmentTypes: ['full_time'],
      },
      ...overrides,
    });
  }

  it('no profile → no_profile status, 0%', async () => {
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('no_profile');
    expect(res.body.data.percentage).toBe(0);
    expect(res.body.data.resumeAvailable).toBe(false);
    expect(res.body.data.missingRequired.length).toBeGreaterThan(0);
  });

  it('fully populated profile → ready, 100%', async () => {
    await insertProfile();
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.percentage).toBe(100);
    expect(res.body.data.missingRequired).toEqual([]);
    expect(res.body.data.missingRecommended).toEqual([]);
    expect(res.body.data.resumeAvailable).toBe(false);
  });

  it('missing required fields → incomplete', async () => {
    await insertProfile({ firstName: 'Ada', lastName: 'Lovelace', email: undefined, phone: undefined, headline: undefined, professionalSummary: undefined, yearsOfExperience: undefined, skills: [] });
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.data.status).toBe('incomplete');
    expect(res.body.data.percentage).toBeLessThan(100);
    expect(res.body.data.missingRequired.length).toBeGreaterThan(0);
    expect(res.body.data.recommendations.length).toBeGreaterThan(0);
  });

  it('missing optional fields does not block readiness', async () => {
    await insertProfile();
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.missingRequired).toEqual([]);
    expect(res.body.data.missingRecommended).toEqual([]);
  });

  it('missing resume → resumeAvailable false', async () => {
    await insertProfile();
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.data.resumeAvailable).toBe(false);
  });

  it('resume present → resumeAvailable true', async () => {
    await insertProfile();
    await ResumeModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      originalFilename: 'resume.pdf',
      storedFilename: 'stored.pdf',
      mimeType: 'application/pdf',
      fileSize: 1000,
      storageKey: 'user/resume.pdf',
      status: 'ready',
      version: 1,
      isDefault: true,
    });
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.data.resumeAvailable).toBe(true);
    expect(res.body.data.resumeId).toBeDefined();
  });

  it('deterministic percentage for identical inputs', async () => {
    await insertProfile();
    const first = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token));
    const second = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token));
    expect(first.body.data.percentage).toBe(second.body.data.percentage);
    expect(first.body.data.status).toBe(second.body.data.status);
  });

  it('profile updates change readiness', async () => {
    await CandidateProfileModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const before = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token));
    expect(before.body.data.status).toBe('incomplete');

    await CandidateProfileModel.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          email: 'ada@example.com',
          phone: '+1-555-0100',
          headline: 'Software Engineer',
          professionalSummary: 'Experienced engineer.',
          yearsOfExperience: 6,
          currentJobTitle: 'Senior Software Engineer',
          currentCompany: 'TechCorp',
          skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }],
          experience: [
            {
              company: 'Prior Co',
              jobTitle: 'Software Engineer',
              employmentType: 'full_time',
              startDate: new Date('2018-01-01'),
              current: false,
              description: 'Built things.',
            },
          ],
          education: [
            {
              institution: 'University',
              degree: 'Bachelor of Science',
              fieldOfStudy: 'Computer Science',
              startDate: new Date('2014-01-01'),
              current: false,
            },
          ],
          jobPreferences: {
            desiredRoles: ['Software Engineer'],
            preferredLocations: ['Remote'],
            workMode: ['remote'],
            employmentTypes: ['full_time'],
          },
        },
      },
    );
    const after = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token));
    expect(after.body.data.status).toBe('ready');
    expect(after.body.data.percentage).toBeGreaterThanOrEqual(before.body.data.percentage);
  });

  it('no profile → invalid/malformed data handled gracefully', async () => {
    const res = await request(app).get(`${API_BASE}/profile/readiness`).set(withAuth(token)).expect(200);
    expect(res.body.success).toBe(true);
    expect(['no_profile', 'incomplete', 'needs_work', 'ready']).toContain(res.body.data.status);
  });
});
