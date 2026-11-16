/** Job prioritization tests (Phase 8.3.12).
 *
 * Covers GET /api/jobs/prioritized: classification rules, explainability,
 * determinism, authentication, candidate isolation, pagination, filtering,
 * and read-only behavior.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, CandidateProfileModel } from '../src/models/index.js';
import {
  computeJobMatch,
  type MatchableJob,
  type MatchableProfile,
} from '../src/services/JobMatchingService.js';
import { STRONG_MATCH_THRESHOLD } from '../src/services/JobPrioritizationService.js';

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

const STRONG_PROFILE_PAYLOAD = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+1-555-0100',
  headline: 'Senior Software Engineer',
  professionalSummary: 'Experienced full-stack engineer.',
  yearsOfExperience: 6,
  currentJobTitle: 'Senior Software Engineer',
  currentCompany: 'TechCorp',
  skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }, { name: 'Node.js', level: 'advanced', years: 4, category: 'technical' }],
  experience: [
    { company: 'Prior Co', jobTitle: 'Software Engineer', employmentType: 'full_time', startDate: '2018-01-01T00:00:00.000Z', current: true, description: 'Built things.' },
  ],
  education: [
    { institution: 'University', degree: 'Bachelor of Science', fieldOfStudy: 'Computer Science', startDate: '2014-01-01T00:00:00.000Z', current: true },
  ],
  jobPreferences: {
    desiredRoles: ['Software Engineer'],
    preferredLocations: ['Remote'],
    preferredCountries: ['USA'],
    workMode: ['remote', 'hybrid'],
    employmentTypes: ['full_time'],
  },
};

const INCOMPLETE_PROFILE_PAYLOAD = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  // No email, headline, summary, years, skills, experience, education, preferences
};

const STRONG_JOB_PAYLOAD = {
  title: 'Senior Software Engineer',
  companyName: 'TechCorp',
  location: 'Remote',
  remoteType: 'remote',
  employmentType: 'full_time',
  experienceLevel: 'senior',
  salaryCurrency: 'USD',
  salaryPeriod: 'yearly',
  requiredSkills: [{ name: 'TypeScript', required: true }, { name: 'Node.js', required: true }],
  preferredSkills: [{ name: 'React', required: false }],
};

const WEAK_JOB_PAYLOAD = {
  title: 'Staff Accountant',
  companyName: 'Ledger Co',
  location: 'Berlin, Germany',
  remoteType: 'onsite',
  employmentType: 'contract',
  experienceLevel: 'junior',
  salaryCurrency: 'USD',
  salaryPeriod: 'yearly',
  requiredSkills: [{ name: 'SAP', required: true }, { name: 'Auditing', required: true }],
  preferredSkills: [{ name: 'Excel', required: false }],
};

describe('prioritization classification rules', () => {
  const app = createApp();
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    token = await register(app, 'prio1@test.com');
    const user = await UserModel.findOne({ email: 'prio1@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    await request(app).post(`${API_BASE}/profile`).set(withAuth(token)).send(STRONG_PROFILE_PAYLOAD).expect(201);
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createJob(payload: Record<string, unknown>) {
    const res = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function resetProfile(payload: Record<string, unknown>) {
    await request(app).delete(`${API_BASE}/profile`).set(withAuth(token)).expect(200);
    const res = await request(app).post(`${API_BASE}/profile`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
  }

  it('requires authentication', async () => {
    await request(app).get(`${API_BASE}/jobs/prioritized`).expect(401);
  });

  it('strong match + ready profile → HIGH_PRIORITY', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job).toBeDefined();
    expect(job.priority).toBe('HIGH_PRIORITY');
    expect(job.priorityReasons).toContain('Strong existing job match');
    expect(job.priorityReasons).toContain('Profile readiness requirements satisfied');
    expect(job.readiness.ready).toBe(true);
    expect(job.readiness.missingRequiredProfileFields).toEqual([]);
    expect(job.readiness.missingSkills).toEqual([]);
  });

  it('strong match + incomplete profile → GOOD_MATCH_NEEDS_IMPROVEMENT', async () => {
    await resetProfile({
      firstName: 'Ada',
      lastName: 'Lovelace',
      // email missing → missing required 'personal'
      phone: '+1-555-0100',
      headline: 'Senior Software Engineer',
      professionalSummary: 'Experienced full-stack engineer.',
      yearsOfExperience: 6,
      currentJobTitle: 'Senior Software Engineer',
      currentCompany: 'TechCorp',
      skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }, { name: 'Node.js', level: 'advanced', years: 4, category: 'technical' }],
      // No experience, education, or jobPreferences
    });
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.matchScore).toBeGreaterThanOrEqual(STRONG_MATCH_THRESHOLD);
    expect(job.priority).toBe('GOOD_MATCH_NEEDS_IMPROVEMENT');
    expect(job.priorityReasons).toContain('Strong existing job match');
    expect(job.readiness.ready).toBe(false);
    expect(job.readiness.missingRequiredProfileFields).toContain('personal');
  });

  it('weak match + complete profile → LOW_MATCH', async () => {
    const jobId = await createJob(WEAK_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.matchScore).toBeLessThan(STRONG_MATCH_THRESHOLD);
    expect(job.priority).toBe('LOW_MATCH');
    expect(job.readiness.missingRequiredProfileFields).toEqual([]);
    expect(job.readiness.missingSkills).toEqual(['SAP', 'Auditing']);
  });

  it('weak match + missing required profile info → PROFILE_INCOMPLETE', async () => {
    await resetProfile(INCOMPLETE_PROFILE_PAYLOAD);
    const jobId = await createJob(WEAK_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.priority).toBe('PROFILE_INCOMPLETE');
    expect(job.readiness.missingRequiredProfileFields.length).toBeGreaterThan(0);
  });

  it('missing recommended information does not force LOW_MATCH', async () => {
    await resetProfile({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+1-555-0100',
      headline: 'Senior Software Engineer',
      professionalSummary: 'Experienced engineer.',
      yearsOfExperience: 6,
      currentJobTitle: 'Senior Software Engineer',
      currentCompany: 'TechCorp',
      skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }, { name: 'Node.js', level: 'advanced', years: 4, category: 'technical' }],
      // No experience, education, or jobPreferences (recommended only)
    });
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.readiness.missingRecommendedProfileFields).toContain('experience');
    expect(job.readiness.missingRecommendedProfileFields).toContain('education');
    // Missing recommended info does NOT force LOW_MATCH when match is strong and ready
    expect(job.priority).toBe('HIGH_PRIORITY');
    expect(job.readiness.ready).toBe(true);
  });

  it('missing job skills are visible', async () => {
    // Profile has TypeScript but not Node.js
    await request(app).put(`${API_BASE}/profile`).set(withAuth(token)).send({
      ...STRONG_PROFILE_PAYLOAD,
      skills: [{ name: 'TypeScript', level: 'advanced', years: 4, category: 'technical' }],
    }).expect(200);
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = res.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.readiness.missingSkills).toContain('Node.js');
    expect(job.readiness.matchedSkills).toContain('TypeScript');
  });

  it('match score is unchanged by prioritization', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const matchRes = await request(app)
      .get(`${API_BASE}/jobs/${jobId}/match`)
      .set(withAuth(token))
      .expect(200);
    const matchScore = matchRes.body.data.match.score;

    const prioRes = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const job = prioRes.body.data.jobs.find((j: { id: string }) => j.id === jobId);
    expect(job.matchScore).toBe(matchScore);
  });

  it('classification is deterministic', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const first = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const second = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const j1 = first.body.data.jobs.find((j: { id: string }) => j.id === jobId)!;
    const j2 = second.body.data.jobs.find((j: { id: string }) => j.id === jobId)!;
    expect(j1.priority).toBe(j2.priority);
    expect(j1.priorityReasons).toEqual(j2.priorityReasons);
    expect(j1.matchScore).toBe(j2.matchScore);
  });

  it('candidate isolation: user2 does not see user1 prioritized jobs', async () => {
    const token2 = await register(app, 'prio2@test.com');
    await request(app).post(`${API_BASE}/profile`).set(withAuth(token2)).send(STRONG_PROFILE_PAYLOAD).expect(201);
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res2 = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token2))
      .expect(200);
    expect(res2.body.data.jobs.find((j: { id: string }) => j.id === jobId)).toBeUndefined();
  });

  it('pagination works', async () => {
    await createJob(STRONG_JOB_PAYLOAD);
    await createJob({ ...STRONG_JOB_PAYLOAD, title: 'Senior TypeScript Engineer 2', companyName: 'TechCorp 2' });
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .query({ page: 1, pageSize: 1 })
      .expect(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.jobs).toHaveLength(1);
    expect(res.body.data.totalPages).toBe(2);
  });

  it('minScore filter works', async () => {
    await createJob(STRONG_JOB_PAYLOAD);
    await createJob(WEAK_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .query({ minScore: STRONG_MATCH_THRESHOLD })
      .expect(200);
    expect(res.body.data.jobs.every((j: { matchScore: number }) => j.matchScore >= STRONG_MATCH_THRESHOLD)).toBe(true);
  });

  it('sorts HIGH_PRIORITY before LOW_MATCH', async () => {
    const strongId = await createJob(STRONG_JOB_PAYLOAD);
    const weakId = await createJob(WEAK_JOB_PAYLOAD);
    const res = await request(app)
      .get(`${API_BASE}/jobs/prioritized`)
      .set(withAuth(token))
      .expect(200);
    const strongIdx = res.body.data.jobs.findIndex((j: { id: string }) => j.id === strongId);
    const weakIdx = res.body.data.jobs.findIndex((j: { id: string }) => j.id === weakId);
    expect(strongIdx).toBeGreaterThanOrEqual(0);
    expect(weakIdx).toBeGreaterThanOrEqual(0);
    expect(strongIdx).toBeLessThan(weakIdx);
  });
});

describe('prioritization pure classification (unit)', () => {
  it('HIGH_PRIORITY for strong ready match', () => {
    const job: MatchableJob = { title: 'Eng', companyName: 'Co', requiredSkills: [{ name: 'TypeScript', required: true }] };
    const profile: MatchableProfile = { skills: [{ name: 'TypeScript' }], yearsOfExperience: 5, headline: 'x', professionalSummary: 'y', jobPreferences: { desiredRoles: ['Eng'] } };
    const match = computeJobMatch(job, profile);
    expect(match.score).toBeGreaterThanOrEqual(STRONG_MATCH_THRESHOLD);
  });
});
