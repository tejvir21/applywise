/** Profile job-readiness API integration tests (Phase 8.3.10).
 *
 * Covers GET /api/profile/readiness/jobs/:jobId:
 * authentication, job validation, service integration, and read-only behavior.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import {
  UserModel,
  JobModel,
  CandidateProfileModel,
  ResumeModel,
  ApplicationModel,
} from '../src/models/index.js';
import { DailySubmissionCounterModel } from '../src/models/DailySubmissionCounter.js';
import { SubmissionReservationModel } from '../src/models/SubmissionReservation.js';

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

describe('Profile job readiness (Phase 8.3.10)', () => {
  const app = createApp();
  let token: string;
  let userId: string;
  let jobId: string;

  const jobFixture = {
    title: 'Senior TypeScript Engineer',
    companyName: 'TechCorp',
    remoteType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    requiredSkills: [{ name: 'TypeScript', required: true }, { name: 'Go', required: true }],
    preferredSkills: [{ name: 'React', required: false }],
    sources: [{ name: 'manual', discoveredAt: new Date() }],
    status: 'active',
    discoveredAt: new Date(),
  };

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await DailySubmissionCounterModel.deleteMany({}).exec();
      await SubmissionReservationModel.deleteMany({}).exec();
    }
    token = await register(app, 'jobreadiness@test.com');
    const user = await UserModel.findOne({ email: 'jobreadiness@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await DailySubmissionCounterModel.deleteMany({}).exec();
      await SubmissionReservationModel.deleteMany({}).exec();
    }
    const job = await JobModel.create(jobFixture);
    jobId = job._id.toString();
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  describe('Authentication and access', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app).get(`${API_BASE}/profile/readiness/jobs/${jobId}`).expect(401);
    });

    it('authenticated candidate can request readiness for a job', async () => {
      const res = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ready).toBe(false);
      // No profile -> all required profile fields missing; both required job skills missing.
      expect(res.body.data.missingRequiredProfileFields).toContain('personal');
      expect(res.body.data.missingRequiredProfileFields).toContain('professional');
      expect(res.body.data.missingRequiredProfileFields).toContain('skills');
      expect(res.body.data.missingSkills).toEqual(['TypeScript', 'Go']);
      expect(res.body.data.matchedSkills).toEqual([]);
    });

    it('candidate identity comes from authentication context only', async () => {
      // user1 has an incomplete profile for the same job.
      await CandidateProfileModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        firstName: 'Ada',
        lastName: 'Lovelace',
        skills: [],
      });
      const res1 = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res1.body.data.missingSkills).toEqual(['TypeScript', 'Go']);

      // user2 has a complete profile including TypeScript; same job -> only Go missing.
      const reg2 = await request(app)
        .post(`${API_BASE}/auth/register`)
        .send({ email: 'jobreadiness2@test.com', password: 'password123' });
      expect(reg2.status).toBe(201);
      const token2 = reg2.body.data.access_token;
      const user2 = await UserModel.findOne({ email: 'jobreadiness2@test.com' }).lean();
      const user2Id = user2!._id.toString();
      await CandidateProfileModel.create({
        userId: new mongoose.Types.ObjectId(user2Id),
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+1-555-0100',
        headline: 'Software Engineer',
        professionalSummary: 'Experienced engineer.',
        yearsOfExperience: 6,
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
      });
      const res2 = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token2))
        .expect(200);
      expect(res2.body.data.missingSkills).toEqual(['Go']);
      expect(res2.body.data.matchedSkills).toContain('TypeScript');
    });
  });

  describe('Job validation', () => {
    it('invalid job ID returns the standard validation error (422)', async () => {
      await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/not-an-object-id`)
        .set(withAuth(token))
        .expect(422);
    });

    it('nonexistent job returns 404', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${fakeId}`)
        .set(withAuth(token))
        .expect(404);
    });

    it('valid job is passed to the readiness service', async () => {
      const res = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.missingSkills).toContain('TypeScript');
      expect(res.body.data.missingSkills).toContain('Go');
    });
  });

  describe('Service integration', () => {
    it('returns the service assessment with missing profile and job fields', async () => {
      const res = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ready).toBe(false);
      expect(res.body.data.missingRequiredProfileFields.length).toBeGreaterThan(0);
      expect(res.body.data.missingRecommendedProfileFields).toContain('experience');
      expect(res.body.data.missingRecommendedProfileFields).toContain('education');
      expect(res.body.data.missingSkills).toEqual(['TypeScript', 'Go']);
      expect(res.body.data.matchedSkills).toEqual([]);
    });

    it('matched skills are reported when the profile has them', async () => {
      await CandidateProfileModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+1-555-0100',
        headline: 'Software Engineer',
        professionalSummary: 'Experienced engineer.',
        yearsOfExperience: 6,
        skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }],
      });
      const res = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.data.matchedSkills).toContain('TypeScript');
      expect(res.body.data.missingSkills).toEqual(['Go']);
    });

    it('ready when all required profile fields and required job skills are present', async () => {
      await CandidateProfileModel.create({
        userId: new mongoose.Types.ObjectId(userId),
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+1-555-0100',
        headline: 'Software Engineer',
        professionalSummary: 'Experienced engineer.',
        yearsOfExperience: 6,
        skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }, { name: 'Go', level: 'intermediate', years: 2, category: 'technical' }],
      });
      const res = await request(app)
        .get(`${API_BASE}/profile/readiness/jobs/${jobId}`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.data.ready).toBe(true);
      expect(res.body.data.missingRequiredProfileFields).toEqual([]);
      expect(res.body.data.missingSkills).toEqual([]);
    });
  });

  describe('Read-only behavior', () => {
    it('does not modify the profile or the job', async () => {
      const profileBefore = await CandidateProfileModel.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      }).lean();
      const jobBefore = await JobModel.findById(jobId).lean();

      await request(app).get(`${API_BASE}/profile/readiness/jobs/${jobId}`).set(withAuth(token)).expect(200);

      const profileAfter = await CandidateProfileModel.findOne({
        userId: new mongoose.Types.ObjectId(userId),
      }).lean();
      const jobAfter = await JobModel.findById(jobId).lean();
      expect(profileAfter).toEqual(profileBefore);
      expect(jobAfter).toEqual(jobBefore);
    });

    it('creates no application, counter, or reservation records', async () => {
      const beforeApps = await ApplicationModel.countDocuments({}).exec();
      const beforeCounters = await DailySubmissionCounterModel.countDocuments({}).exec();
      const beforeReservations = await SubmissionReservationModel.countDocuments({}).exec();

      await request(app).get(`${API_BASE}/profile/readiness/jobs/${jobId}`).set(withAuth(token)).expect(200);

      const afterApps = await ApplicationModel.countDocuments({}).exec();
      const afterCounters = await DailySubmissionCounterModel.countDocuments({}).exec();
      const afterReservations = await SubmissionReservationModel.countDocuments({}).exec();
      expect(afterApps).toBe(beforeApps);
      expect(afterCounters).toBe(beforeCounters);
      expect(afterReservations).toBe(beforeReservations);
    });
  });
});
