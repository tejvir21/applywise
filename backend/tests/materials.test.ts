/** AI materials tests (Phase 7): providers, honesty guards, workflow gates. */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';
import { MockAIProvider } from '../src/ai/MockAIProvider.js';
import { OllamaProvider, extractText } from '../src/ai/OllamaProvider.js';
import { AIProviderError } from '../src/ai/AIProvider.js';
import { getAIProvider } from '../src/ai/index.js';
import { generateResumeDraft, generateAnswer } from '../src/services/MaterialGenerationService.js';
import type { AIProvider } from '../src/ai/AIProvider.js';

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
  jobPreferences: { desiredRoles: ['Software Engineer'], workMode: ['remote'] },
};

const JOB_PAYLOAD = {
  title: 'Software Engineer',
  companyName: 'TechCorp',
  requiredSkills: [{ name: 'TypeScript', required: true }, { name: 'Rust', required: true }],
};

describe('AI providers', () => {
  it('uses the deterministic mock provider by default', () => {
    expect(getAIProvider().name).toBe('mock');
  });

  it('mock cover letters use only verified facts and flag missing skills', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateContent({
      kind: 'coverLetter',
      systemPrompt: 's',
      userPrompt: 'u',
      facts: { candidateName: 'Ada Lovelace', skills: ['TypeScript'], missingSkills: ['Rust'] },
    });
    const parsed = JSON.parse(res.text);
    expect(parsed.body).toContain('Ada Lovelace');
    expect(parsed.body).not.toContain('Rust');
    expect(parsed.flaggedGaps).toEqual(expect.arrayContaining(['No verified record of required skill: Rust']));
  });

  it('mock answers always require confirmation', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateContent({
      kind: 'answer',
      systemPrompt: 's',
      userPrompt: 'u',
      facts: { question: 'Why us?' },
    });
    expect(JSON.parse(res.text).needsConfirmation).toBe(true);
  });

  it('extractText tolerates fenced JSON and rejects empty payloads', () => {
    expect(extractText({ response: '```json\n{"a":1}\n```' })).toBe('{"a":1}');
    expect(extractText({ response: '{"a":1}' })).toBe('{"a":1}');
    expect(extractText({})).toBeNull();
    expect(extractText(null)).toBeNull();
  });

  it('ollama provider returns model text on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"body":"hi","flaggedGaps":[]}' }),
    });
    const provider = new OllamaProvider('http://localhost:11434', 'test-model', 5000, fetchFn as unknown as typeof fetch);
    const res = await provider.generateContent({ kind: 'coverLetter', systemPrompt: 's', userPrompt: 'u', facts: {} });
    expect(res.text).toBe('{"body":"hi","flaggedGaps":[]}');
    expect(res.model).toBe('test-model');
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('ollama provider maps failures to generic AIProviderError without leaking details', async () => {
    const failing = new OllamaProvider('http://localhost:1', 'm', 1000, (async () => {
      throw new Error('connect ECONNREFUSED with secret-key-abc');
    }) as unknown as typeof fetch);
    await expect(failing.generateContent({ kind: 'coverLetter', systemPrompt: 's', userPrompt: 'u', facts: {} }))
      .rejects.toMatchObject({ name: 'AppError', code: 'AI_PROVIDER_ERROR' });

    const badStatus = new OllamaProvider('http://x', 'm', 1000, (async () => ({ ok: false })) as unknown as typeof fetch);
    await expect(badStatus.generateContent({ kind: 'coverLetter', systemPrompt: 's', userPrompt: 'u', facts: {} }))
      .rejects.toBeInstanceOf(AIProviderError);

    const malformed = new OllamaProvider('http://x', 'm', 1000, (async () => ({
      ok: true,
      json: async () => ({ nope: true }),
    })) as unknown as typeof fetch);
    await expect(malformed.generateContent({ kind: 'coverLetter', systemPrompt: 's', userPrompt: 'u', facts: {} }))
      .rejects.toBeInstanceOf(AIProviderError);
  });
});

describe('Application materials API', () => {
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
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'mat1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'mat2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
    user1Id = (await UserModel.findOne({ email: 'mat1@test.com' }).exec())!._id;
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

  async function createJobAndDraft(token: string, materials?: Record<string, unknown>) {
    const job = await request(app).post(`${API_BASE}/jobs/manual`).set(withAuth(token)).send(JOB_PAYLOAD);
    expect(job.status).toBe(201);
    const draft = await request(app)
      .post(`${API_BASE}/applications`)
      .set(withAuth(token))
      .send(materials ? { jobId: job.body.data.id, materials } : { jobId: job.body.data.id });
    expect(draft.status).toBe(201);
    return draft.body.data.id as string;
  }

  it('rejects unauthenticated materials access', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await request(app).get(`${API_BASE}/applications/${fakeId}/materials`).expect(401);
    await request(app).post(`${API_BASE}/applications/${fakeId}/materials/cover-letter`).expect(401);
    await request(app).post(`${API_BASE}/applications/${fakeId}/materials/resume`).expect(401);
    await request(app).post(`${API_BASE}/applications/${fakeId}/materials/answers`).send({ question: 'Q' }).expect(401);
    await request(app).patch(`${API_BASE}/applications/${fakeId}/materials`).send({}).expect(401);
    await request(app).post(`${API_BASE}/applications/${fakeId}/materials/review`).expect(401);
  });

  it('generates a cover letter from verified facts with gaps flagged', async () => {
    const appId = await createJobAndDraft(user1Token);

    const res = await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/cover-letter`)
      .set(withAuth(user1Token))
      .send({})
      .expect(201);

    expect(res.body.data.coverLetter).toContain('Ada Lovelace');
    expect(res.body.data.flaggedGaps).toEqual(expect.arrayContaining(['No verified record of required skill: rust']));
    expect(res.body.data.provider).toBe('mock');

    const saved = await request(app).get(`${API_BASE}/applications/${appId}/materials`).set(withAuth(user1Token)).expect(200);
    expect(saved.body.data.materials.coverLetter).toBe(res.body.data.coverLetter);
    expect(saved.body.data.provenance.provider).toBe('mock');
    expect(saved.body.data.provenance.jobId).toBeDefined();
    expect(saved.body.data.status).toBe('DRAFT');
  });

  it('preserves existing drafts unless replace is explicit', async () => {
    const appId = await createJobAndDraft(user1Token);
    await request(app).post(`${API_BASE}/applications/${appId}/materials/cover-letter`).set(withAuth(user1Token)).send({}).expect(201);

    const conflict = await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/cover-letter`)
      .set(withAuth(user1Token))
      .send({})
      .expect(409);
    expect(conflict.body.success).toBe(false);

    await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/cover-letter`)
      .set(withAuth(user1Token))
      .send({ replace: true })
      .expect(201);
  });

  it('generates a tailored resume draft without touching the original resume', async () => {
    const before = await ResumeModel.create({
      userId: user1Id,
      originalFilename: 'resume.pdf',
      storedFilename: 'stored.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      storageKey: 'k',
      status: 'ready',
      version: 2,
      isDefault: true,
    });
    const beforeJson = JSON.stringify(before.toObject());
    const appId = await createJobAndDraft(user1Token);

    // Attach the resume via draft update, then generate.
    await request(app).patch(`${API_BASE}/applications/${appId}`).set(withAuth(user1Token)).send({ resumeId: before._id.toString() }).expect(200);
    const res = await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/resume`)
      .set(withAuth(user1Token))
      .send({})
      .expect(201);

    expect(res.body.data.tailoredResume.summary).toContain('Ada Lovelace');
    for (const skill of res.body.data.tailoredResume.skillsUsed as string[]) {
      expect(['typescript', 'node.js']).toContain(skill.toLowerCase());
    }

    const after = await ResumeModel.findById(before._id).lean().exec();
    expect(JSON.stringify({ ...after, updatedAt: undefined })).toContain('resume.pdf');
    expect(after!.version).toBe(2);
    expect(JSON.stringify(after)).not.toContain('Tailored for');
    void beforeJson;
  });

  it('strips unverified skills from generated resume drafts', async () => {
    const appId = await createJobAndDraft(user1Token);
    const fabricating: AIProvider = {
      name: 'fabricator',
      generateContent: async () => ({
        text: JSON.stringify({ summary: 'S', highlights: [], skillsUsed: ['TypeScript', 'Klingon Engineering'], flaggedGaps: [] }),
        model: 'test',
        provider: 'fabricator',
      }),
    };

    const result = await generateResumeDraft(user1Id, appId, {}, fabricating);
    expect(result.tailoredResume.skillsUsed).toEqual(['TypeScript']);
    expect(result.tailoredResume.flaggedGaps).toEqual(
      expect.arrayContaining(['Removed unverified skill reference: Klingon Engineering']),
    );
  });

  it('generates unverified answers and guards regeneration', async () => {
    const appId = await createJobAndDraft(user1Token);

    const res = await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/answers`)
      .set(withAuth(user1Token))
      .send({ question: 'Are you authorized to work in the US?' })
      .expect(201);

    expect(res.body.data.answer.verified).toBe(false);
    expect(res.body.data.answer.sensitive).toBe(true);

    await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/answers`)
      .set(withAuth(user1Token))
      .send({ question: 'Are you authorized to work in the US?' })
      .expect(409);

    await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/answers`)
      .set(withAuth(user1Token))
      .send({ question: 'Are you authorized to work in the US?', replace: true })
      .expect(201);
  });

  it('rejects malformed model output without leaking details', async () => {
    const appId = await createJobAndDraft(user1Token);
    const broken: AIProvider = {
      name: 'broken',
      generateContent: async () => ({ text: 'not json at all', model: 'test', provider: 'broken' }),
    };
    await expect(generateAnswer(user1Id, appId, 'Why us?', {}, broken)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
    });
  });

  it('edits drafts and locks them after review is requested', async () => {
    const appId = await createJobAndDraft(user1Token);

    await request(app)
      .patch(`${API_BASE}/applications/${appId}/materials`)
      .set(withAuth(user1Token))
      .send({ coverLetter: 'My own words', notes: 'n' })
      .expect(200);

    const saved = await request(app).get(`${API_BASE}/applications/${appId}/materials`).set(withAuth(user1Token)).expect(200);
    expect(saved.body.data.materials.coverLetter).toBe('My own words');

    const resumeId = (
      await ResumeModel.create({
        userId: user1Id, originalFilename: 'r.pdf', storedFilename: 's.pdf',
        mimeType: 'application/pdf', fileSize: 10, storageKey: 'k2', status: 'ready',
      })
    )._id.toString();
    await request(app).patch(`${API_BASE}/applications/${appId}`).set(withAuth(user1Token)).send({ resumeId }).expect(200);
    await request(app).post(`${API_BASE}/applications/${appId}/request-review`).set(withAuth(user1Token)).send({}).expect(200);

    await request(app)
      .patch(`${API_BASE}/applications/${appId}/materials`)
      .set(withAuth(user1Token))
      .send({ coverLetter: 'Changed after review' })
      .expect(422);
    await request(app)
      .post(`${API_BASE}/applications/${appId}/materials/cover-letter`)
      .set(withAuth(user1Token))
      .send({ replace: true })
      .expect(422);
  });

  it('marks materials reviewed with an audit event and never submits', async () => {
    const appId = await createJobAndDraft(user1Token);
    await request(app).post(`${API_BASE}/applications/${appId}/materials/cover-letter`).set(withAuth(user1Token)).send({}).expect(201);

    const res = await request(app).post(`${API_BASE}/applications/${appId}/materials/review`).set(withAuth(user1Token)).expect(200);
    expect(res.body.data.reviewedAt).toBeDefined();
    expect(res.body.data.status).toBe('DRAFT');

    const events = await request(app).get(`${API_BASE}/applications/${appId}/events`).set(withAuth(user1Token)).expect(200);
    const types = events.body.data.events.map((e: { type: string }) => e.type);
    expect(types).toEqual(expect.arrayContaining(['cover_letter_generated', 'materials_reviewed']));
  });

  it('enforces ownership on materials endpoints', async () => {
    const appId = await createJobAndDraft(user1Token);

    await request(app).get(`${API_BASE}/applications/${appId}/materials`).set(withAuth(user2Token)).expect(404);
    await request(app).post(`${API_BASE}/applications/${appId}/materials/cover-letter`).set(withAuth(user2Token)).send({}).expect(404);
    await request(app).patch(`${API_BASE}/applications/${appId}/materials`).set(withAuth(user2Token)).send({}).expect(404);
  });
});
