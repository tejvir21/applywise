/** Duplicate job creation integration tests (Phase 8.3.7). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel } from '../src/models/index.js';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('Duplicate job creation (Phase 8.3.7)', () => {
  const app = createApp();
  let token: string;

  beforeAll(async () => {
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
    }
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'dupjob@test.com', password: 'password123' });
    expect(reg.status).toBe(201);
    token = reg.body.data.access_token;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
    }
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function createManualJob(body: Record<string, unknown>) {
    return request(app)
      .post(`${API_BASE}/jobs/manual`)
      .set(withAuth(token))
      .send(body);
  }

  const base = {
    title: 'Senior Software Engineer',
    companyName: 'TechCorp',
    location: 'San Francisco, CA',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    requiredSkills: [{ name: 'TypeScript', required: true }],
  };

  it('rejects duplicate creation by same company+title+location+URL (normalized key)', async () => {
    const first = await createManualJob({
      ...base,
      applicationUrl: 'https://techcorp.com/jobs/eng-1',
    });
    expect(first.status).toBe(201);

    const second = await createManualJob({
      ...base,
      applicationUrl: 'https://techcorp.com/jobs/eng-1',
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE');
    expect(second.body.error.details.duplicateJobId).toBeDefined();
  });

  it('allows same title+company but different location', async () => {
    const first = await createManualJob({ ...base, location: 'Remote', applicationUrl: 'https://a.corp/j' });
    expect(first.status).toBe(201);

    const second = await createManualJob({ ...base, location: 'Onsite', applicationUrl: 'https://a.corp/j' });
    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toEqual(first.body.data.id);
  });

  it('allows same title+company but different application URL', async () => {
    const first = await createManualJob({ ...base, location: 'Remote', applicationUrl: 'https://a.corp/j1' });
    expect(first.status).toBe(201);

    const second = await createManualJob({ ...base, location: 'Remote', applicationUrl: 'https://a.corp/j2' });
    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toEqual(first.body.data.id);
  });
});
