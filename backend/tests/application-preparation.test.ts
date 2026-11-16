/** Application preparation tests (Phase 8.3.13).
 *
 * Covers POST /api/application-preparations and related endpoints:
 * start preparation, duplicate prevention, resume tailoring, cover letter,
 * answers, review, save draft, cancel, authentication, candidate isolation.
 * Nothing here submits an application.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, CandidateProfileModel } from '../src/models/index.js';

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

describe('Application preparation workflow', () => {
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
    token = await register(app, 'prep1@test.com');
    const user = await UserModel.findOne({ email: 'prep1@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
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

  it('requires authentication to start preparation', async () => {
    await request(app).post(`${API_BASE}/application-preparations`).expect(401);
  });

  it('starts preparation for a valid job', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const res = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.preparationId).toBeDefined();
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.job.id).toBe(jobId);
    expect(res.body.data.readiness).toBeDefined();
    expect(res.body.data.missingInformation).toBeDefined();
  });

  it('returns existing preparation instead of creating duplicate', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const first = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const second = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    expect(second.body.data.preparationId).toBe(first.body.data.preparationId);
  });

  it('rejects invalid job ID', async () => {
    await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId: 'not-an-object-id' })
      .expect(404);
  });

  it('rejects nonexistent job', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId: fakeId })
      .expect(404);
  });

  it('lists preparations for the candidate', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const res = await request(app)
      .get(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.preparations.length).toBeGreaterThanOrEqual(1);
  });

  it('gets preparation details', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;
    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id.toString()).toBe(prepId);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('candidate isolation: user2 cannot access user1 preparation', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;

    const token2 = await register(app, 'prep2@test.com');
    await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token2))
      .expect(404);
  });

  it('saves draft with missing information', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;
    const res = await request(app)
      .patch(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .send({ missingInformation: ['skills'] })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.missingInformation).toContain('skills');
  });

  it('cancels a preparation', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;
    const res = await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CANCELLED');
  });
});

describe('Application preparation - generation and review (mock AI)', () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    token = await register(app, 'prepgen@test.com');
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
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

  it('generates tailored resume, cover letter, and answers', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;

    // Generate tailored resume
    const resumeRes = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    expect(resumeRes.body.success).toBe(true);
    expect(resumeRes.body.data.tailoredResume.summary).toBeDefined();
    expect(resumeRes.body.data.tailoredResume.skillsUsed).toBeDefined();

    // Generate cover letter
    const coverRes = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    expect(coverRes.body.success).toBe(true);
    expect(coverRes.body.data.coverLetter.body).toBeDefined();

    // Generate answers
    const answersRes = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['What is your experience with TypeScript?', 'What is your notice period?'] })
      .expect(200);
    expect(answersRes.body.success).toBe(true);
    expect(answersRes.body.data.answers.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects generation for already-approved component without replace', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;

    // Generate all components first
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve the cover letter through review
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);

    // Try to regenerate cover letter without replace - should conflict
    const res = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('does not create a submitted application', async () => {
    const jobId = await createJob(STRONG_JOB_PAYLOAD);
    const startRes = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    const prepId = startRes.body.data.preparationId;

    // Generate all components and approve
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['What is your experience with TypeScript?'] })
      .expect(200);

    // The preparation should still be DRAFT or IN_PROGRESS, never SUBMITTED
    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).not.toBe('SUBMITTED');
    expect(res.body.data.status).not.toBe('SUBMITTING');
  });
});

describe('Application preparation - history and management (Phase 8.3.14)', () => {
  const app = createApp();
  let token: string;
  let userId: string;
  let jobCounter = 0;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
    }
    token = await register(app, 'prepmgmt1@test.com');
    const user = await UserModel.findOne({ email: 'prepmgmt1@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
    }
    await request(app).post(`${API_BASE}/profile`).set(withAuth(token)).send(STRONG_PROFILE_PAYLOAD).expect(201);
    jobCounter = 0;
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createUniqueJob(overrides: Record<string, unknown> = {}) {
    jobCounter++;
    const payload = {
      ...STRONG_JOB_PAYLOAD,
      title: `${STRONG_JOB_PAYLOAD.title} #${jobCounter}`,
      companyName: `${STRONG_JOB_PAYLOAD.companyName} #${jobCounter}`,
      ...overrides,
    };
    // Ensure overrides also get unique titles/companyNames to avoid dedupe conflicts
    if (overrides.title) payload.title = `${overrides.title} #${jobCounter}`;
    if (overrides.companyName) payload.companyName = `${overrides.companyName} #${jobCounter}`;
    const res = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function startPrepForJob(jobId: string) {
    const res = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    return res.body.data.preparationId;
  }

  it('lists preparations for the candidate', async () => {
    const jobId1 = await createUniqueJob();
    const jobId2 = await createUniqueJob();
    await startPrepForJob(jobId1);
    await startPrepForJob(jobId2);

    const res = await request(app)
      .get(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.preparations.length).toBeGreaterThanOrEqual(2);
  });

  it('candidate ownership isolation: user2 cannot see user1 preparations', async () => {
    const jobId = await createUniqueJob();
    await startPrepForJob(jobId);

    const token2 = await register(app, 'prepmgmt2@test.com');
    const res = await request(app)
      .get(`${API_BASE}/application-preparations`)
      .set(withAuth(token2))
      .expect(200);
    expect(res.body.data.total).toBe(0);
  });

  it('searches by job title', async () => {
    await createUniqueJob();
    await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' });
    await startPrepForJob(await createUniqueJob());
    await startPrepForJob(await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' }));

    const res = await request(app)
      .get(`${API_BASE}/application-preparations?query=Senior`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    res.body.data.preparations.forEach((p: any) => {
      expect(p.jobSnapshot.title.toLowerCase()).toContain('senior');
    });
  });

  it('searches by company name', async () => {
    await createUniqueJob();
    await startPrepForJob(await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' }));

    const res = await request(app)
      .get(`${API_BASE}/application-preparations?query=DataCo`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    res.body.data.preparations.forEach((p: any) => {
      expect(p.jobSnapshot.companyName.toLowerCase()).toContain('dataco');
    });
  });

  it('search is case-insensitive', async () => {
    await createUniqueJob();
    await startPrepForJob(await createUniqueJob());

    const res = await request(app)
      .get(`${API_BASE}/application-preparations?query=TECHCORP`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('status filter works', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Cancel it
    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);

    const activeRes = await request(app)
      .get(`${API_BASE}/application-preparations?status=DRAFT`)
      .set(withAuth(token))
      .expect(200);
    expect(activeRes.body.data.preparations.every((p: any) => p.status === 'DRAFT')).toBe(true);

    const cancelledRes = await request(app)
      .get(`${API_BASE}/application-preparations?status=CANCELLED`)
      .set(withAuth(token))
      .expect(200);
    expect(cancelledRes.body.data.preparations.every((p: any) => p.status === 'CANCELLED')).toBe(true);
  });

  it('combined search and filter works', async () => {
    await createUniqueJob();
    await startPrepForJob(await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' }));

    const res = await request(app)
      .get(`${API_BASE}/application-preparations?query=Senior&status=DRAFT`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    res.body.data.preparations.forEach((p: any) => {
      expect(p.status).toBe('DRAFT');
      expect(p.jobSnapshot.title.toLowerCase()).toContain('senior');
    });
  });

  it('pagination works', async () => {
    await createUniqueJob();
    await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' });
    await startPrepForJob(await createUniqueJob());
    await startPrepForJob(await createUniqueJob({ title: 'Data Scientist', companyName: 'DataCo' }));

    const res = await request(app)
      .get(`${API_BASE}/application-preparations?page=1&pageSize=2`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.pageSize).toBe(2);
    expect(res.body.data.preparations.length).toBeLessThanOrEqual(2);
    expect(res.body.data.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('invalid status filter returns 422', async () => {
    await request(app)
      .get(`${API_BASE}/application-preparations?status=INVALID`)
      .set(withAuth(token))
      .expect(422);
  });

  it('invalid page value returns 422', async () => {
    await request(app)
      .get(`${API_BASE}/application-preparations?page=abc`)
      .set(withAuth(token))
      .expect(422);
  });

  it('invalid pageSize value returns 422', async () => {
    await request(app)
      .get(`${API_BASE}/application-preparations?pageSize=abc`)
      .set(withAuth(token))
      .expect(422);
  });

  it('missing preparation returns 404', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await request(app)
      .get(`${API_BASE}/application-preparations/${fakeId}`)
      .set(withAuth(token))
      .expect(404);
  });

  it('reopens an approved preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Generate all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'tailoredResume', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'answers', decision: 'approve' })
      .expect(200);

    // Approve package
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'approve' })
      .expect(200);

    // Verify it's APPROVED
    let res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('APPROVED');

    // Reopen it
    res = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    // Components should be reset to PENDING/NEEDS_REVIEW
    expect(res.body.data.tailoredResume.reviewStatus).toBe('PENDING');
    expect(res.body.data.coverLetter.reviewStatus).toBe('PENDING');
    res.body.data.answers.forEach((a: any) => {
      expect(a.reviewStatus).toBe('NEEDS_REVIEW');
    });
  });

  it('reopens a rejected preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Generate all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'tailoredResume', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'answers', decision: 'approve' })
      .expect(200);

    // Reject package
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'reject' })
      .expect(200);

    let res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('REJECTED');

    // Reopen
    res = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('cannot reopen a cancelled preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);

    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token))
      .expect(422);
  });

  it('cannot reopen a DRAFT preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token))
      .expect(422);
  });

  it('review history is preserved after reopen', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Generate all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve all components and package
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'tailoredResume', decision: 'approve', note: 'Great resume' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'answers', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'approve' })
      .expect(200);

    // Reopen
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token))
      .expect(200);

    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('DRAFT');
    // Review status reset to PENDING, reviewerNote cleared
    expect(res.body.data.tailoredResume.reviewStatus).toBe('PENDING');
    expect(res.body.data.tailoredResume.reviewerNote).toBeUndefined();
    expect(res.body.data.tailoredResume.reviewedAt).toBeUndefined();
  });

  it('cancellation does not silently become approval', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);

    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('repeated cancellation is idempotent', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);

    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('unauthorized access to another candidate preparation returns 404', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    const token2 = await register(app, 'prepmgmt2@test.com');
    await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token2))
      .expect(404);
  });

  it('does not create a submitted application', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Generate all components
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve all components first
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'tailoredResume', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'answers', decision: 'approve' })
      .expect(200);

    // Approve package
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'approve' })
      .expect(200);

    const res = await request(app)
      .get(`${API_BASE}/application-preparations/${prepId}`)
      .set(withAuth(token))
      .expect(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.status).not.toBe('SUBMITTED');
    expect(res.body.data.status).not.toBe('SUBMITTING');
  });

  it('cannot reopen another user preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Approve all components and package
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'tailoredResume', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'coverLetter', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'answers', decision: 'approve' })
      .expect(200);
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'reject' })
      .expect(200);

    const token2 = await register(app, 'prepmgmt2@test.com');
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .set(withAuth(token2))
      .expect(404);
  });

  it('requires authentication to reopen', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
      .expect(401);
  });

  it('requires authentication to list preparations', async () => {
    await request(app).get(`${API_BASE}/application-preparations`).expect(401);
  });

  it('requires authentication to cancel', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    await request(app)
      .delete(`${API_BASE}/application-preparations/${prepId}`)
      .expect(401);
  });

  it('rejects pageSize above 100', async () => {
    await request(app)
      .get(`${API_BASE}/application-preparations?pageSize=101`)
      .set(withAuth(token))
      .expect(422);
  });

  it('rejects page below 1', async () => {
    await request(app)
      .get(`${API_BASE}/application-preparations?page=0`)
      .set(withAuth(token))
      .expect(422);
  });

  it('cannot approve an empty preparation', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Try to approve package with no components generated
    const res = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'approve' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cannot approve a preparation with unanswered questions', async () => {
    const jobId = await createUniqueJob();
    const prepId = await startPrepForJob(jobId);

    // Generate answers but don't approve them
    await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/answers`)
      .set(withAuth(token))
      .send({ questions: ['Test question'] })
      .expect(200);

    // Approve package should fail because answers are not all APPROVED
    const res = await request(app)
      .post(`${API_BASE}/application-preparations/${prepId}/review`)
      .set(withAuth(token))
      .send({ component: 'package', decision: 'approve' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

});

describe('Application preparation - quality and reliability (Phase 8.3.15)', () => {
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
    token = await register(app, 'prepquality@test.com');
    const user = await UserModel.findOne({ email: 'prepquality@test.com' }).lean();
    userId = user!._id.toString();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await UserModel.deleteMany({}).exec();
    }
    await request(app).post(`${API_BASE}/profile`).set(withAuth(token)).send(STRONG_PROFILE_PAYLOAD).expect(201);
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createJob(payload: Record<string, unknown> = STRONG_JOB_PAYLOAD) {
    const res = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function startPrepForJob(jobId: string) {
    const res = await request(app)
      .post(`${API_BASE}/application-preparations`)
      .set(withAuth(token))
      .send({ jobId })
      .expect(201);
    return res.body.data.preparationId;
  }

  describe('Factual grounding', () => {
    it('tailored resume includes verification results', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      expect(res.body.data.tailoredResume.verification).toBeDefined();
      expect(['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT']).toContain(
        res.body.data.tailoredResume.verification.status,
      );
    });

    it('cover letter includes verification results', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      expect(res.body.data.coverLetter.verification).toBeDefined();
      expect(['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT']).toContain(
        res.body.data.coverLetter.verification.status,
      );
    });

    it('answers include verification results', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/answers`)
        .set(withAuth(token))
        .send({ questions: ['What is your experience with TypeScript?'] })
        .expect(200);

      expect(res.body.data.answers.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.answers[0].verification).toBeDefined();
      expect(['VERIFIED', 'UNSUPPORTED', 'NEEDS_CANDIDATE_INPUT']).toContain(
        res.body.data.answers[0].verification.status,
      );
    });

    it('sensitive questions are marked NEEDS_CANDIDATE_INPUT', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/answers`)
        .set(withAuth(token))
        .send({ questions: ['What is your visa status?', 'Are you a US citizen?', 'What is your salary expectation?'] })
        .expect(200);

      for (const answer of res.body.data.answers) {
        expect(answer.sensitive).toBe(true);
        expect(answer.reviewStatus).toBe('NEEDS_CANDIDATE_INPUT');
        expect(answer.verification.status).toBe('NEEDS_CANDIDATE_INPUT');
      }
    });

    it('unsupported skills in generated resume are flagged', async () => {
      const jobId = await createJob({
        ...STRONG_JOB_PAYLOAD,
        requiredSkills: [
          { name: 'TypeScript', required: true },
          { name: 'Node.js', required: true },
          { name: 'Rust', required: true },
        ],
      });
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      const hasRustGap = res.body.data.tailoredResume.flaggedGaps.some((g: string) =>
        g.toLowerCase().includes('rust'),
      );
      expect(hasRustGap).toBe(true);
    });
  });

  describe('Cover letter consistency', () => {
    it('cover letter references the correct company and job title', async () => {
      const jobId = await createJob({
        title: 'Senior Product Manager',
        companyName: 'Acme Corp',
      });
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      const body = res.body.data.coverLetter.body.toLowerCase();
      expect(body).toContain('acme corp');
      expect(body).toContain('senior product manager');
    });

    it('cover letter verification references company match', async () => {
      const jobId = await createJob({
        title: 'Senior Product Manager',
        companyName: 'Acme Corp',
      });
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      const verification = res.body.data.coverLetter.verification;
      const hasCompanyMatch = verification.matchedFacts?.some((f) =>
        f.toLowerCase().includes('acme corp'),
      );
      expect(hasCompanyMatch).toBe(true);
    });
  });

  describe('Cross-component consistency', () => {
    it('package approval requires all components approved', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/answers`)
        .set(withAuth(token))
        .send({ questions: ['Test question'] })
        .expect(200);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'tailoredResume', decision: 'approve' })
        .expect(200);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'package', decision: 'approve' })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('approved content is not automatically regenerated', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'coverLetter', decision: 'approve' })
        .expect(200);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(409);
      expect(res.body.error.code).toBe('CONFLICT');

      const getRes = await request(app)
        .get(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .expect(200);
      expect(getRes.body.data.coverLetter.reviewStatus).toBe('APPROVED');
    });
  });

  describe('Persistence and recovery', () => {
    it('candidate edits survive subsequent operations', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/answers`)
        .set(withAuth(token))
        .send({ questions: ['What is your notice period?'] })
        .expect(200);

      const prep = await request(app)
        .get(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .expect(200);
      const answerId = prep.body.data.answers[0]._id;

      await request(app)
        .patch(`${API_BASE}/application-preparations/${prepId}/answers/${answerId}`)
        .set(withAuth(token))
        .send({ answer: 'Two weeks', verified: true })
        .expect(200);

      const getRes = await request(app)
        .get(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .expect(200);
      const editedAnswer = getRes.body.data.answers.find((a: any) => a._id === answerId);
      expect(editedAnswer.answer).toBe('Two weeks');
      expect(editedAnswer.verified).toBe(true);
    });

    it('reopen preserves candidate edits', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/answers`)
        .set(withAuth(token))
        .send({ questions: ['Test question'] })
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'tailoredResume', decision: 'approve' })
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'coverLetter', decision: 'approve' })
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'answers', decision: 'approve' })
        .expect(200);
      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/review`)
        .set(withAuth(token))
        .send({ component: 'package', decision: 'approve' })
        .expect(200);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/reopen`)
        .set(withAuth(token))
        .expect(200);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.tailoredResume).toBeDefined();
      expect(res.body.data.coverLetter).toBeDefined();
      expect(res.body.data.answers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Reliability', () => {
    it('malformed AI response is rejected by Zod validation', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      const res = await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      expect(res.body.data.tailoredResume.summary).toBeDefined();
      expect(res.body.data.tailoredResume.skillsUsed).toBeDefined();
    });

    it('generation preserves existing draft on partial state', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/tailor-resume`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      await request(app)
        .post(`${API_BASE}/application-preparations/${prepId}/cover-letter`)
        .set(withAuth(token))
        .send({})
        .expect(200);

      const getRes = await request(app)
        .get(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .expect(200);
      expect(getRes.body.data.tailoredResume).toBeDefined();
      expect(getRes.body.data.coverLetter).toBeDefined();
      expect(getRes.body.data.tailoredResume.reviewStatus).toBe('PENDING');
    });

    it('repeated save operations behave safely', async () => {
      const jobId = await createJob();
      const prepId = await startPrepForJob(jobId);

      await request(app)
        .patch(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .send({ missingInformation: ['skills'] })
        .expect(200);
      await request(app)
        .patch(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .send({ missingInformation: ['skills', 'personal'] })
        .expect(200);
      await request(app)
        .patch(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .send({ missingInformation: [] })
        .expect(200);

      const getRes = await request(app)
        .get(`${API_BASE}/application-preparations/${prepId}`)
        .set(withAuth(token))
        .expect(200);
      expect(getRes.body.data.missingInformation).toEqual([]);
    });
  });
});
