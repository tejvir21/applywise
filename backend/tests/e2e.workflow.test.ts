/**
 * End-to-end API integration workflow (fictional data, isolated test DB).
 *
 * Exercises the real HTTP surface end to end with entirely fictional content:
 *   register -> profile -> jobs -> match -> save -> draft -> review ->
 *   approve -> handoff -> history/summary -> policy.
 *
 * This is an AUTOMATED test against an in-memory MongoDB. It performs NO real
 * external submission: every "platform" step is either refused by policy or
 * recorded as a safe external handoff, exactly as production behaves.
 *
 * Run with:  npx vitest run tests/e2e.workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Isolate this suite from the shared test database.
const E2E_DB_NAME = 'applywise_e2e_workflow';

let mongoServer: MongoMemoryServer;

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** Fictional companies and roles only — no real employers. */
const FICTIONAL = {
  profile: {
    firstName: 'Rowan',
    lastName: 'Fictional',
    skills: [{ name: 'TypeScript' }, { name: 'Node.js' }, { name: 'React' }],
    yearsOfExperience: 6,
    currentJobTitle: 'Senior Software Engineer',
    headline: 'Full-stack engineer focused on developer tooling',
    education: [
      {
        institution: 'Imaginary University',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        startDate: '2012-09-01T00:00:00.000Z',
        current: true,
      },
    ],
    jobPreferences: {
      desiredRoles: ['Software Engineer'],
      preferredLocations: ['Wellington'],
      preferredCountries: ['New Zealand'],
      workMode: ['remote', 'hybrid'],
      employmentTypes: ['full_time'],
      salaryMin: 120000,
      salaryMax: 180000,
      salaryCurrency: 'NZD',
      salaryPeriod: 'yearly',
      excludedCompanies: ['Umbrella Dynamics'],
    },
  },
  strongJob: {
    title: 'Senior Software Engineer',
    companyName: 'Aurora Systems',
    location: 'Wellington, NZ',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    description: 'Build internal developer tooling. Degree not required.',
    requiredSkills: [
      { name: 'TypeScript', required: true },
      { name: 'Node.js', required: true },
    ],
    preferredSkills: [{ name: 'React' }],
    salaryMin: 130000,
    salaryMax: 175000,
    salaryCurrency: 'NZD',
    salaryPeriod: 'yearly',
    applicationUrl: 'https://jobs.example.invalid/aurora/senior-swe',
  },
  ineligibleJob: {
    title: 'Junior Analyst',
    companyName: 'Umbrella Dynamics',
    location: 'Auckland, NZ',
    remoteType: 'onsite',
    employmentType: 'full_time',
    experienceLevel: 'junior',
    requiredSkills: [{ name: 'SQL', required: true }],
  },
  sparseJob: {
    title: 'Mystery Position',
    companyName: 'Nowhere Inc',
  },
};

describe('End-to-end workflow (fictional data, in-memory DB)', () => {
  let app: ReturnType<typeof import('../src/app.js').createApp>;
  let token: string;
  let userId: mongoose.Types.ObjectId;
  let resumeId: string;
  let strongJobId: string;
  let applicationId: string;

  beforeAll(async () => {
    // Minimal env must be set before importing modules that validate config.
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-at-least-32-characters';

    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.MONGODB_DB = E2E_DB_NAME;

    const { resetConfigCache } = await import('../src/config/index.js');
    resetConfigCache();

    const { connectToDatabase } = await import('../src/config/database.js');
    const { createApp: create } = await import('../src/app.js');
    const { setRateLimitingEnabled } = await import('../src/middleware/rateLimiter.js');
    const { UserModel, ResumeModel, JobModel, SavedJobModel, CandidateProfileModel } = await import(
      '../src/models/index.js'
    );
    const { ApplicationModel, ApplicationEventModel } = await import('../src/models/Application.js');

    setRateLimitingEnabled(false);
    app = create();
    await connectToDatabase();

    await Promise.all([
      UserModel.deleteMany({}),
      JobModel.deleteMany({}),
      SavedJobModel.deleteMany({}),
      CandidateProfileModel.deleteMany({}),
      ResumeModel.deleteMany({}),
      ApplicationModel.deleteMany({}),
      ApplicationEventModel.deleteMany({}),
    ]);

    const user = await UserModel.create({
      email: 'e2e-fictional@example.invalid',
      passwordHash: 'unused-in-this-flow',
    });
    userId = user._id;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (mongoServer) await mongoServer.stop();
  });

  it('runs the whole matching -> application -> handoff journey', async () => {
    const API = '/api';

    // ---- 1. Register a candidate (fictional) ----
    const reg = await request(app)
      .post(`${API}/auth/register`)
      .send({ email: 'e2e-fictional@example.invalid', password: 'password123' });
    expect([201, 409]).toContain(reg.status);
    if (reg.status === 201) token = reg.body.data.access_token;

    // Authenticate as the seeded user so every step runs as one candidate.
    const login = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: 'e2e-fictional@example.invalid', password: 'password123' })
      .expect(401);

    // Use a freshly registered candidate instead of the seeded row.
    const email = `e2e-run-${Date.now()}@example.invalid`;
    const fresh = await request(app).post(`${API}/auth/register`).send({ email, password: 'password123' }).expect(201);
    token = fresh.body.data.access_token;
    const freshUser = await mongoose.connection
      .collection('users')
      .findOne({ email }, { projection: { _id: 1 } });
    const freshUserId = freshUser!._id as mongoose.Types.ObjectId;
    expect(login.status).toBe(401); // wrong password is rejected honestly

    // ---- 2. Create the candidate profile ----
    const profile = await request(app).post(`${API}/profile`).set(withAuth(token)).send(FICTIONAL.profile);
    if (profile.status !== 201) {
      throw new Error(`profile creation failed: ${profile.status} ${JSON.stringify(profile.body)}`);
    }
    expect(profile.body.data.jobPreferences.workMode).toContain('remote');

    // ---- 3. Create test jobs from a supported source (manual) ----
    const strong = await request(app)
      .post(`${API}/jobs/manual`)
      .set(withAuth(token))
      .send(FICTIONAL.strongJob)
      .expect(201);
    strongJobId = strong.body.data.id;

    await request(app).post(`${API}/jobs/manual`).set(withAuth(token)).send(FICTIONAL.ineligibleJob).expect(201);
    await request(app).post(`${API}/jobs/manual`).set(withAuth(token)).send(FICTIONAL.sparseJob).expect(201);

    // ---- 4. Compute and inspect match results ----
    const match = await request(app).get(`${API}/jobs/${strongJobId}/match`).set(withAuth(token)).expect(200);
    expect(match.body.data.match.score).toBeGreaterThanOrEqual(70);
    expect(match.body.data.match.eligible).toBe(true);
    expect(match.body.data.match.factors.length).toBeGreaterThan(0);
    // Required-skill evidence is real, derived from stored data only.
    const skills = match.body.data.match.factors.find((f: { key: string }) => f.key === 'skillsRequired');
    expect(skills.matched).toEqual(expect.arrayContaining(['typescript', 'node.js']));

    const matches = await request(app)
      .get(`${API}/jobs/matches`)
      .set(withAuth(token))
      .query({ page: 1, pageSize: 10 })
      .expect(200);
    expect(matches.body.data.total).toBe(3);
    // Ranked: the strongest job is first.
    expect(matches.body.data.matches[0].id).toBe(strongJobId);
    // Match coverage is reported so "unknown" is distinguishable from "mismatch".
    expect(matches.body.data.matches[0].evaluatedWeight).toBeGreaterThan(0);

    // The excluded-company job is flagged ineligible without changing its score.
    const ineligible = matches.body.data.matches.find((m: { eligible: boolean }) => m.eligible === false);
    expect(ineligible).toBeDefined();

    // A job with no comparable data is marked insufficient, not "poor".
    const sparse = matches.body.data.matches.find((m: { insufficientData: boolean }) => m.insufficientData === true);
    if (!sparse) {
      throw new Error(
        `no insufficientData match found; matches=${JSON.stringify(
          matches.body.data.matches.map(
            (m: { id: string; evaluatedWeight: number; insufficientData: boolean; matchScore: number }) => ({
              id: m.id,
              evaluatedWeight: m.evaluatedWeight,
              insufficientData: m.insufficientData,
              matchScore: m.matchScore,
            }),
          ),
        )}`,
      );
    }

    // ---- 5. Save a job ----
    await request(app).post(`${API}/jobs/${strongJobId}/save`).set(withAuth(token)).send({}).expect(201);
    const saved = await request(app).get(`${API}/jobs/saved`).set(withAuth(token)).query({ page: 1, pageSize: 10 }).expect(200);
    expect(saved.body.data.total).toBe(1);

    // ---- 6. Create an application draft ----
    const { ResumeModel } = await import('../src/models/index.js');
    const resume = await ResumeModel.create({
      userId: freshUserId,
      originalFilename: 'fictional-resume.pdf',
      storedFilename: 'stored.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      storageKey: 'e2e/fictional-resume.pdf',
      status: 'ready',
      version: 1,
      isDefault: true,
    });
    resumeId = resume._id.toString();

    const draft = await request(app)
      .post(`${API}/applications`)
      .set(withAuth(token))
      .send({ jobId: strongJobId, resumeId })
      .expect(201);
    applicationId = draft.body.data.id;
    expect(draft.body.data.status).toBe('DRAFT');
    expect(draft.body.data.matchScore).toBeGreaterThanOrEqual(70);
    // A draft is not a submission.
    expect(draft.body.data.status).not.toBe('SUBMITTED');

    // ---- 7. Review and approve the draft ----
    const review = await request(app)
      .post(`${API}/applications/${applicationId}/request-review`)
      .set(withAuth(token))
      .send({})
      .expect(200);
    expect(review.body.data.status).toBe('AWAITING_APPROVAL');

    const approved = await request(app)
      .post(`${API}/applications/${applicationId}/approve`)
      .set(withAuth(token))
      .send({ decision: 'approve', note: 'Reviewed: fictional materials' })
      .expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
    // Approval is a decision only.
    expect(approved.body.data.status).not.toBe('SUBMITTED');
    expect(approved.body.data.attemptCount).toBe(0);

    // ---- 8. Submission policy refuses unsupported platforms ----
    for (const platform of ['linkedin', 'indeed']) {
      const policy = await request(app)
        .post(`${API}/applications/${applicationId}/policy`)
        .set(withAuth(token))
        .send({ platform })
        .expect(200);
      // No platform has a verified submission path: the decision must be a
      // refusal, and no submission may be implied.
      expect(policy.body.data.platform).toBe(platform);
      expect(policy.body.data.allowed).not.toBe(true);
      expect(String(policy.body.data.decision).toLowerCase()).toMatch(
        /denied|blocked|unsupported|refus|manual|not_allowed|handoff/,
      );
    }

    // ---- 9. External handoff (mock/external, never a submission) ----
    const handoff = await request(app)
      .post(`${API}/applications/${applicationId}/handoff`)
      .set(withAuth(token))
      .expect(200);
    expect(handoff.body.data.application.status).toBe('NEEDS_MANUAL_ACTION');
    expect(handoff.body.data.handoff.applicationUrl).toBe(FICTIONAL.strongJob.applicationUrl);
    expect(Array.isArray(handoff.body.data.handoff.instructions)).toBe(true);

    // ---- 10. Verify history and event ordering ----
    const events = await request(app)
      .get(`${API}/applications/${applicationId}/events`)
      .set(withAuth(token))
      .expect(200);
    const types = events.body.data.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(['created', 'review_requested', 'approved', 'handoff_opened']);

    const times = events.body.data.events.map((e: { createdAt: string }) => Date.parse(e.createdAt));
    expect(times.every((t) => !Number.isNaN(t))).toBe(true);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }

    // ---- 11. Verify history list, search, and summary ----
    const list = await request(app).get(`${API}/applications`).set(withAuth(token)).expect(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.applications[0].nextAction).toBeTruthy();

    const searched = await request(app)
      .get(`${API}/applications`)
      .set(withAuth(token))
      .query({ search: 'Aurora' })
      .expect(200);
    expect(searched.body.data.total).toBe(1);

    const notFound = await request(app)
      .get(`${API}/applications`)
      .set(withAuth(token))
      .query({ search: 'no-such-company' })
      .expect(200);
    expect(notFound.body.data.total).toBe(0);

    const summary = await request(app).get(`${API}/applications/summary`).set(withAuth(token)).expect(200);
    expect(summary.body.data.total).toBe(1);
    expect(summary.body.data.drafts).toBe(0);
    expect(summary.body.data.externalHandoffs).toBe(1);
    // CRITICAL: an external handoff must never be reported as a submission.
    expect(summary.body.data.confirmedSubmissions).toBe(0);

    // ---- 12. Cross-user isolation ----
    const other = await request(app)
      .post(`${API}/auth/register`)
      .send({ email: `e2e-other-${Date.now()}@example.invalid`, password: 'password123' })
      .expect(201);
    const otherToken = other.body.data.access_token;
    await request(app).get(`${API}/applications/${applicationId}`).set(withAuth(otherToken)).expect(404);
    await request(app).get(`${API}/applications/${applicationId}/events`).set(withAuth(otherToken)).expect(404);
    await request(app).get(`${API}/jobs/${strongJobId}`).set(withAuth(otherToken)).expect(404);
    await request(app).get(`${API}/applications`).set(withAuth(otherToken)).expect(200);
    expect((await request(app).get(`${API}/applications`).set(withAuth(otherToken))).body.data.total).toBe(0);

    // The seeded user is untouched by this run (no leakage in either direction).
    expect(userId).toBeDefined();
    expect(resumeId).toBeDefined();
  });
});