/** Cookie session tests: login/register set HttpOnly refresh cookies; GET /session restores; logout clears. */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';

const API_BASE = '/api';

function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? raw : [];
  const entry = list.find((c) => typeof c === 'string' && c.startsWith('refresh_token='));
  return typeof entry === 'string' ? entry : undefined;
}

describe('Cookie sessions (post-deployment repair)', () => {
  const app = createApp();

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
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
    }
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  it('sets an HttpOnly refresh cookie on register and login', async () => {
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'sess1@test.com', password: 'password123' })
      .expect(201);
    const regCookie = refreshCookie(reg);
    expect(regCookie).toBeDefined();
    expect(regCookie!).toContain('HttpOnly');
    expect(regCookie!).toContain('Path=/api/auth');

    const login = await request(app)
      .post(`${API_BASE}/auth/login`)
      .send({ email: 'sess1@test.com', password: 'password123' })
      .expect(200);
    const loginCookie = refreshCookie(login);
    expect(loginCookie).toBeDefined();
    expect(loginCookie!).toContain('HttpOnly');
    // Refresh token stays out of the JSON body on the cookie path is covered
    // by /session below; login keeps the legacy body contract intact.
    expect(login.body.data.refresh_token).toBeDefined();
  });

  it('restores a session from the cookie and rotates it', async () => {
    const agent = request.agent(app);
    await agent.post(`${API_BASE}/auth/register`).send({ email: 'sess2@test.com', password: 'password123' }).expect(201);

    const first = await agent.get(`${API_BASE}/auth/session`).expect(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data.access_token).toBeDefined();
    expect(first.body.data.refresh_token).toBeUndefined();
    const rotated = refreshCookie(first);
    expect(rotated).toBeDefined();

    // The rotated cookie works for a follow-up restore.
    const second = await agent.get(`${API_BASE}/auth/session`).expect(200);
    expect(second.body.data.access_token).toBeDefined();

    // Restored access token authorizes protected routes.
    const me = await agent
      .get(`${API_BASE}/auth/me`)
      .set('Authorization', `Bearer ${second.body.data.access_token}`)
      .expect(200);
    expect(me.body.data.email).toBe('sess2@test.com');
  });

  it('returns 401 from /session without a cookie and rejects forged cookies', async () => {
    await request(app).get(`${API_BASE}/auth/session`).expect(401);
    await request(app)
      .get(`${API_BASE}/auth/session`)
      .set('Cookie', 'refresh_token=forged.token.value')
      .expect(401);
  });

  it('clears the refresh cookie on logout', async () => {
    const agent = request.agent(app);
    await agent.post(`${API_BASE}/auth/register`).send({ email: 'sess3@test.com', password: 'password123' }).expect(201);
    await agent.get(`${API_BASE}/auth/session`).expect(200);

    const logout = await agent.post(`${API_BASE}/auth/logout`).expect(200);
    const cleared = refreshCookie(logout);
    expect(cleared).toBeDefined();
    expect(cleared!).toMatch(/refresh_token=;/);

    // Cookie jar no longer yields a session.
    await agent.get(`${API_BASE}/auth/session`).expect(401);
  });

  it('invalidates the server session on logout: stolen cookies stop working', async () => {
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'sess5@test.com', password: 'password123' })
      .expect(201);
    const setCookies = reg.headers['set-cookie'] as unknown as string[];
    const cookie = setCookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];

    await request(app).post(`${API_BASE}/auth/logout`).set('Cookie', cookie).expect(200);
    // The copied cookie no longer restores or refreshes anything.
    await request(app).get(`${API_BASE}/auth/session`).set('Cookie', cookie).expect(401);
  });

  it('rejects replayed refresh tokens after rotation', async () => {
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'sess6@test.com', password: 'password123' })
      .expect(201);
    const firstToken = reg.body.data.refresh_token as string;

    await request(app).post(`${API_BASE}/auth/refresh`).send({ refresh_token: firstToken }).expect(200);
    // The same token cannot be used twice.
    const replay = await request(app).post(`${API_BASE}/auth/refresh`).send({ refresh_token: firstToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('UNAUTHORIZED');
  });

  it('keeps the body-token refresh contract working', async () => {
    const reg = await request(app)
      .post(`${API_BASE}/auth/register`)
      .send({ email: 'sess4@test.com', password: 'password123' })
      .expect(201);
    const refreshed = await request(app)
      .post(`${API_BASE}/auth/refresh`)
      .send({ refresh_token: reg.body.data.refresh_token })
      .expect(200);
    expect(refreshed.body.data.access_token).toBeDefined();
    expect(refreshCookie(refreshed)).toBeDefined();
  });
});
