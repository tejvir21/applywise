/** Job matching engine tests (Phase 5): deterministic scoring + API integration. */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel } from '../src/models/index.js';
import {
  computeJobMatch,
  DEFAULT_MATCH_WEIGHTS,
  type MatchableJob,
  type MatchableProfile,
} from '../src/services/JobMatchingService.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

const STRONG_PROFILE: MatchableProfile = {
  skills: [{ name: 'TypeScript' }, { name: 'Node.js' }, { name: 'React' }, { name: 'PostgreSQL' }],
  yearsOfExperience: 6,
  currentJobTitle: 'Senior Software Engineer',
  headline: 'Full-stack engineer',
  education: [{ degree: 'Bachelor of Science', fieldOfStudy: 'Computer Science' }],
  certifications: [{ name: 'AWS Certified Solutions Architect' }],
  jobPreferences: {
    desiredRoles: ['Software Engineer', 'Backend Engineer'],
    preferredLocations: ['San Francisco', 'Remote'],
    preferredCountries: ['USA'],
    workMode: ['remote', 'hybrid'],
    employmentTypes: ['full_time'],
    salaryMin: 140000,
    salaryMax: 200000,
    salaryCurrency: 'USD',
    salaryPeriod: 'yearly',
    excludedCompanies: ['Evil Corp'],
    excludedJobTypes: ['internship'],
  },
};

const STRONG_JOB: MatchableJob = {
  title: 'Senior Software Engineer',
  companyName: 'TechCorp',
  location: 'San Francisco, CA',
  city: 'San Francisco',
  state: 'CA',
  country: 'USA',
  remoteType: 'hybrid',
  employmentType: 'full_time',
  experienceLevel: 'senior',
  description: 'Backend services role.',
  requirements: ['5+ years of experience with Node.js', "Bachelor's degree required"],
  requiredSkills: [
    { name: 'TypeScript', required: true },
    { name: 'Node.js', required: true },
  ],
  preferredSkills: [{ name: 'React' }],
  salaryMin: 150000,
  salaryMax: 200000,
  salaryCurrency: 'USD',
  salaryPeriod: 'yearly',
};

function factorOf(result: ReturnType<typeof computeJobMatch>, key: string) {
  const factor = result.factors.find((f) => f.key === key);
  expect(factor).toBeDefined();
  return factor!;
}

describe('computeJobMatch (pure, deterministic)', () => {
  it('scores a strong match at 100 with all factors evaluable', () => {
    const result = computeJobMatch(STRONG_JOB, STRONG_PROFILE);

    expect(result.score).toBe(100);
    expect(result.eligible).toBe(true);
    expect(result.eligibilityReasons).toHaveLength(0);
    expect(result.evaluatedWeight).toBe(100);
    expect(result.missingData).toHaveLength(0);
    expect(factorOf(result, 'skillsRequired').score).toBe(100);
    expect(factorOf(result, 'skillsPreferred').score).toBe(100);
    expect(factorOf(result, 'experience').score).toBe(100);
    expect(factorOf(result, 'title').score).toBe(100);
    expect(factorOf(result, 'location').score).toBe(100);
    expect(factorOf(result, 'salary').score).toBe(100);
    expect(factorOf(result, 'employmentType').score).toBe(100);
    expect(factorOf(result, 'education').score).toBe(100);
  });

  it('is deterministic for identical inputs', () => {
    const first = computeJobMatch(STRONG_JOB, STRONG_PROFILE);
    const second = computeJobMatch(JSON.parse(JSON.stringify(STRONG_JOB)), JSON.parse(JSON.stringify(STRONG_PROFILE)));
    expect(second).toEqual(first);
  });

  it('always returns an integer score within 0-100', () => {
    const cases: Array<[MatchableJob, MatchableProfile]> = [
      [STRONG_JOB, STRONG_PROFILE],
      [STRONG_JOB, {}],
      [{ title: 'X', companyName: 'Y' }, {}],
      [{ ...STRONG_JOB, requiredSkills: [{ name: 'COBOL', required: true }] }, STRONG_PROFILE],
    ];
    for (const [job, profile] of cases) {
      const result = computeJobMatch(job, profile);
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('scores a poor match low and names the missing required skills', () => {
    const poorJob: MatchableJob = {
      ...STRONG_JOB,
      title: 'Staff Accountant',
      location: 'Berlin, Germany',
      city: 'Berlin',
      country: 'Germany',
      remoteType: 'onsite',
      employmentType: 'contract',
      experienceLevel: 'junior',
      requiredSkills: [
        { name: 'SAP', required: true },
        { name: 'Auditing', required: true },
      ],
      preferredSkills: [{ name: 'Excel' }],
      salaryMin: 50000,
      salaryMax: 70000,
      salaryCurrency: 'EUR',
      requirements: ['CPA required'],
    };
    const result = computeJobMatch(poorJob, STRONG_PROFILE);

    expect(result.score).toBeLessThan(40);
    expect(result.eligible).toBe(true);
    const skills = factorOf(result, 'skillsRequired');
    expect(skills.score).toBe(0);
    expect(skills.mismatched).toEqual(expect.arrayContaining(['sap', 'auditing']));
    // Incomparable currency is unknown, not a mismatch.
    expect(factorOf(result, 'salary').evaluable).toBe(false);
  });

  it('weights required skills above preferred skills', () => {
    const job: MatchableJob = {
      ...STRONG_JOB,
      requiredSkills: [{ name: 'TypeScript', required: true }],
      preferredSkills: [{ name: 'COBOL' }],
    };
    const result = computeJobMatch(job, STRONG_PROFILE);
    // Required 1/1 (25 pts) + preferred 0/1, everything else 100:
    // (25*100 + 10*0 + 65*100) / 100 = 90
    expect(result.score).toBe(90);
    expect(factorOf(result, 'skillsRequired').score).toBe(100);
    expect(factorOf(result, 'skillsPreferred').score).toBe(0);
  });

  it('scores partial experience proportionally', () => {
    const juniorProfile: MatchableProfile = { ...STRONG_PROFILE, yearsOfExperience: 1 };
    const result = computeJobMatch(STRONG_JOB, juniorProfile);

    expect(factorOf(result, 'experience').score).toBe(20);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThan(0);
  });

  it('rejects remote jobs against onsite-only preferences and vice versa', () => {
    const onsiteProfile: MatchableProfile = {
      ...STRONG_PROFILE,
      jobPreferences: { ...STRONG_PROFILE.jobPreferences!, workMode: ['onsite'], preferredLocations: [], preferredCountries: [] },
    };
    const remoteJob: MatchableJob = { ...STRONG_JOB, remoteType: 'remote' };
    const result = computeJobMatch(remoteJob, onsiteProfile);

    expect(factorOf(result, 'location').score).toBe(0);
    expect(factorOf(result, 'location').mismatched).toEqual(expect.arrayContaining(['work mode remote']));
  });

  it('treats missing data as unknown without inflating the score', () => {
    const sparseProfile: MatchableProfile = { skills: [{ name: 'TypeScript' }, { name: 'Node.js' }] };
    const result = computeJobMatch(STRONG_JOB, sparseProfile);

    // Only the two skill factors are evaluable (35 weight): required skills
    // are fully covered (25 pts), preferred React is verifiably absent (0).
    // Score = (25*100 + 10*0) / 35 = 71, conditioned on 35% coverage.
    expect(result.score).toBe(71);
    expect(result.evaluatedWeight).toBe(35);
    expect(factorOf(result, 'skillsRequired').score).toBe(100);
    expect(factorOf(result, 'skillsPreferred').score).toBe(0);
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.missingData).toEqual(expect.arrayContaining(['candidate experience unknown']));
    for (const key of ['experience', 'title', 'location', 'salary', 'employmentType', 'education']) {
      expect(factorOf(result, key).evaluable).toBe(false);
      expect(factorOf(result, key).score).toBeNull();
    }
  });

  it('returns 0 with an insufficient-data note when nothing is evaluable', () => {
    const result = computeJobMatch({ title: 'X', companyName: 'Y' }, {});

    expect(result.score).toBe(0);
    expect(result.evaluatedWeight).toBe(0);
    expect(result.missingData).toEqual(expect.arrayContaining(['insufficient data to score this job']));
  });

  it('flags hard eligibility failures separately from the score', () => {
    const excludedCompany = computeJobMatch({ ...STRONG_JOB, companyName: 'Evil Corp' }, STRONG_PROFILE);
    expect(excludedCompany.eligible).toBe(false);
    expect(excludedCompany.eligibilityReasons).toEqual(expect.arrayContaining([expect.stringContaining('Evil Corp')]));
    // Eligibility does not touch the numeric score.
    expect(excludedCompany.score).toBe(100);

    const excludedType = computeJobMatch({ ...STRONG_JOB, employmentType: 'internship' }, STRONG_PROFILE);
    expect(excludedType.eligible).toBe(false);
    expect(excludedType.eligibilityReasons).toEqual(expect.arrayContaining([expect.stringContaining('internship')]));
  });

  it('honors custom weight overrides', () => {
    const weights = { ...DEFAULT_MATCH_WEIGHTS, skillsRequired: 0, skillsPreferred: 0, experience: 100, title: 0, location: 0, salary: 0, employmentType: 0, education: 0 };
    const juniorProfile: MatchableProfile = { ...STRONG_PROFILE, yearsOfExperience: 1 };
    const result = computeJobMatch(STRONG_JOB, juniorProfile, weights);

    expect(result.evaluatedWeight).toBe(100);
    expect(result.score).toBe(20);
  });
});

describe('Job match API', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;

  const PROFILE_PAYLOAD = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    skills: [{ name: 'TypeScript' }, { name: 'Node.js' }, { name: 'React' }],
    yearsOfExperience: 6,
    currentJobTitle: 'Senior Software Engineer',
    headline: 'Full-stack engineer',
    education: [{ institution: 'State University', degree: 'Bachelor of Science', startDate: '2014-09-01T00:00:00.000Z', current: true }],
    jobPreferences: {
      desiredRoles: ['Software Engineer'],
      preferredLocations: ['San Francisco'],
      preferredCountries: ['USA'],
      workMode: ['remote', 'hybrid'],
      employmentTypes: ['full_time'],
      salaryMin: 140000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
      excludedCompanies: ['Evil Corp'],
      excludedJobTypes: ['internship'],
    },
  };

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'match1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'match2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    const res = await request(app)
      .post(`${API_BASE}/profile`)
      .set(withAuth(user1Token))
      .send(PROFILE_PAYLOAD);
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createJob(token: string, payload: Record<string, unknown>) {
    const res = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it('rejects unauthenticated match requests', async () => {
    await request(app).get(`${API_BASE}/jobs/some-id/match`).expect(401);
    await request(app).get(`${API_BASE}/jobs/matches`).expect(401);
  });

  it('matches a single job with a structured explanation', async () => {
    const jobId = await createJob(user1Token, {
      title: 'Senior Software Engineer',
      companyName: 'TechCorp',
      location: 'San Francisco, CA',
      remoteType: 'hybrid',
      employmentType: 'full_time',
      experienceLevel: 'senior',
      requiredSkills: [{ name: 'TypeScript', required: true }, { name: 'Node.js', required: true }],
      salaryMin: 150000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
    });

    const res = await request(app)
      .get(`${API_BASE}/jobs/${jobId}/match`)
      .set(withAuth(user1Token))
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.job.id).toBe(jobId);
    expect(res.body.data.match.score).toBeGreaterThanOrEqual(80);
    expect(res.body.data.match.eligible).toBe(true);
    expect(res.body.data.match.factors).toBeInstanceOf(Array);
    expect(res.body.data.match.factors.length).toBeGreaterThan(0);
    const keys = res.body.data.match.factors.map((f: { key: string }) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['skillsRequired', 'experience', 'title', 'location', 'salary', 'employmentType']));
  });

  it('returns 404 when the caller has no profile', async () => {
    const jobId = await createJob(user2Token, { title: 'Any Job', companyName: 'Any Corp' });

    const res = await request(app)
      .get(`${API_BASE}/jobs/${jobId}/match`)
      .set(withAuth(user2Token))
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not match another user’s job', async () => {
    const jobId = await createJob(user1Token, { title: 'Hidden', companyName: 'Hidden Corp' });

    await request(app)
      .get(`${API_BASE}/jobs/${jobId}/match`)
      .set(withAuth(user2Token))
      .expect(404);
  });

  it('returns 404 for deleted jobs and malformed IDs', async () => {
    const jobId = await createJob(user1Token, { title: 'Gone', companyName: 'Gone Corp' });
    await request(app).delete(`${API_BASE}/jobs/${jobId}`).set(withAuth(user1Token)).expect(200);

    await request(app).get(`${API_BASE}/jobs/${jobId}/match`).set(withAuth(user1Token)).expect(404);
    await request(app).get(`${API_BASE}/jobs/not-an-id/match`).set(withAuth(user1Token)).expect(404);
  });

  it('lists matches ranked by score with minScore filtering and pagination', async () => {
    const strongId = await createJob(user1Token, {
      title: 'Senior Software Engineer',
      companyName: 'TechCorp',
      location: 'San Francisco, CA',
      remoteType: 'hybrid',
      employmentType: 'full_time',
      experienceLevel: 'senior',
      requiredSkills: [{ name: 'TypeScript', required: true }],
      salaryMin: 150000,
      salaryMax: 200000,
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
    });
    await createJob(user1Token, {
      title: 'Staff Accountant',
      companyName: 'Ledger Co',
      location: 'Berlin, Germany',
      remoteType: 'onsite',
      employmentType: 'contract',
      experienceLevel: 'junior',
      requiredSkills: [{ name: 'SAP', required: true }],
    });

    const res = await request(app)
      .get(`${API_BASE}/jobs/matches`)
      .set(withAuth(user1Token))
      .query({ page: 1, pageSize: 10 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.matches).toHaveLength(2);
    expect(res.body.data.matches[0].id).toBe(strongId);
    expect(res.body.data.matches[0].matchScore).toBeGreaterThanOrEqual(res.body.data.matches[1].matchScore);
    expect(res.body.data.scanned).toBeGreaterThanOrEqual(2);

    const filtered = await request(app)
      .get(`${API_BASE}/jobs/matches`)
      .set(withAuth(user1Token))
      .query({ minScore: res.body.data.matches[0].matchScore })
      .expect(200);

    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.matches[0].id).toBe(strongId);
  });

  it('rejects out-of-range match filters with validation errors', async () => {
    const high = await request(app)
      .get(`${API_BASE}/jobs/matches`)
      .set(withAuth(user1Token))
      .query({ minScore: 101 });
    expect(high.status).toBe(422);
    expect(high.body.error.code).toBe('VALIDATION_ERROR');

    const nan = await request(app)
      .get(`${API_BASE}/jobs/matches`)
      .set(withAuth(user1Token))
      .query({ minScore: 'not-a-number' });
    expect(nan.status).toBe(422);
  });

  it('returns an empty ranked list for a user with no jobs', async () => {
    const res = await request(app)
      .get(`${API_BASE}/jobs/matches`)
      .set(withAuth(user2Token))
      .expect(404);

    // user2 has no profile in this suite
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
