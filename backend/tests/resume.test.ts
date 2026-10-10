/** Resume upload, analysis, and import tests (Phase 8.1 P0). */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { resetConfigCache } from '../src/config/index.js';
import { UserModel, JobModel, SavedJobModel, CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ResumeAnalysisModel } from '../src/models/Resume.js';
import { ApplicationModel, ApplicationEventModel } from '../src/models/Application.js';
import { uploadResume } from '../src/services/ResumeService.js';
import { ResumeRepository } from '../src/repositories/ResumeRepository.js';
import mongoose from 'mongoose';

const API_BASE = '/api';

function withAuth(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/** Minimal one-page PDF with selectable text (verified parseable by pdf-parse). */
function buildMinimalPdf(text: string): Buffer {
  const esc = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = `BT /F1 12 Tf 72 720 Td (${esc}) Tj ET`;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

/** Minimal DOCX (ZIP container) with fictional resume content; mammoth-verified. */
const DOCX_FIXTURE_B64 =
  'UEsDBAoAAAAAAN2ISV3MVIwQnAEAAJwBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04Ij8+PFR5cGVzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXMiPjxEZWZhdWx0IEV4dGVuc2lvbj0icmVscyIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1wYWNrYWdlLnJlbGF0aW9uc2hpcHMreG1sIi8+PERlZmF1bHQgRXh0ZW5zaW9uPSJ4bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi94bWwiLz48T3ZlcnJpZGUgUGFydE5hbWU9Ii93b3JkL2RvY3VtZW50LnhtbCIgQ29udGVudFR5cGU9ImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC53b3JkcHJvY2Vzc2luZ21sLmRvY3VtZW50Lm1haW4reG1sIi8+PC9UeXBlcz5QSwMECgAAAAAA3YhJXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAAA3YhJXTZX3twYAQAAGAEAAAsAAABfcmVscy8ucmVsczw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04Ij8+PFJlbGF0aW9uc2hpcHMgeG1sbnM9Imh0dHA6Ly9zY2hlbWFzLm9wZW54bWxmb3JtYXRzLm9yZy9wYWNrYWdlLzIwMDYvcmVsYXRpb25zaGlwcyI+PFJlbGF0aW9uc2hpcCBJZD0icklkMSIgVHlwZT0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL29mZmljZURvY3VtZW50LzIwMDYvcmVsYXRpb25zaGlwcy9vZmZpY2VEb2N1bWVudCIgVGFyZ2V0PSJ3b3JkL2RvY3VtZW50LnhtbCIvPjwvUmVsYXRpb25zaGlwcz5QSwMECgAAAAAA3YhJXQAAAAAAAAAAAAAAAAUAAAB3b3JkL1BLAwQKAAAAAADdiEldtBxeNQcCAAAHAgAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48dzpkb2N1bWVudCB4bWxuczp3PSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvd29yZHByb2Nlc3NpbmdtbC8yMDA2L21haW4iPjx3OmJvZHk+PHc6cD48dzpyPjx3OnQ+QWRhIExvdmVsYWNlPC93OnQ+PC93OnI+PC93OnA+PHc6cD48dzpyPjx3OnQ+YWRhQGZpY3Rpb25hbC50ZXN0IHwgU2FuIEZyYW5jaXNjbywgQ0E8L3c6dD48L3c6cj48L3c6cD48dzpwPjx3OnI+PHc6dD5Ta2lsbHM6IFR5cGVTY3JpcHQsIE5vZGUuanMsIFBvc3RncmVTUUw8L3c6dD48L3c6cj48L3c6cD48dzpwPjx3OnI+PHc6dD5TZW5pb3IgU29mdHdhcmUgRW5naW5lZXIgYXQgVGVjaENvcnAsIEphbiAyMDIwIHRvIFByZXNlbnQ8L3c6dD48L3c6cj48L3c6cD48dzpwPjx3OnI+PHc6dD5CYWNoZWxvciBvZiBTY2llbmNlIGluIENvbXB1dGVyIFNjaWVuY2UsIFN0YXRlIFVuaXZlcnNpdHk8L3c6dD48L3c6cj48L3c6cD48L3c6Ym9keT48L3c6ZG9jdW1lbnQ+UEsBAhQACgAAAAAA3YhJXcxUjBCcAQAAnAEAABMAAAAAAAAAAAAAAAAAAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAAKAAAAAADdiEldAAAAAAAAAAAAAAAABgAAAAAAAAAAABAAAADNAQAAX3JlbHMvUEsBAhQACgAAAAAA3YhJXTZX3twYAQAAGAEAAAsAAAAAAAAAAAAAAAAA8QEAAF9yZWxzLy5yZWxzUEsBAhQACgAAAAAA3YhJXQAAAAAAAAAAAAAAAAUAAAAAAAAAAAAQAAAAMgMAAHdvcmQvUEsBAhQACgAAAAAA3YhJXbQcXjUHAgAABwIAABEAAAAAAAAAAAAAAAAAVQMAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAAFAAUAIAEAAIsFAAAAAA==';

const PDF_BYTES = buildMinimalPdf('Ada Lovelace ada@fictional.test TypeScript Node.js Bachelor of Science');
const DOCX_BYTES = Buffer.from(DOCX_FIXTURE_B64, 'base64');
const TEXT_BYTES = Buffer.from('just some plain text, not a document at all');
const GARBAGE_PDF_BYTES = Buffer.from('%PDF-1.4 this is not really a pdf ((((( binary garbage', 'latin1');

describe('Resumes (Phase 8.1)', () => {
  const app = createApp();
  let user1Token: string;
  let user2Token: string;
  let user1Id: mongoose.Types.ObjectId;
  let storageDir: string;

  beforeAll(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'applywise-resume-test-'));
    // Hermetic disk assertions: this suite verifies files on local disk, so
    // pin the local provider regardless of the developer's .env (which may
    // point at Supabase). Resilient/Supabase paths are covered in
    // storage.resilient.test.ts.
    process.env.STORAGE_PROVIDER = 'local';
    process.env.RESUME_STORAGE_FALLBACK = 'none';
    process.env.RESUME_STORAGE_PATH = storageDir;
    // Re-read config AFTER overriding the env: the app factory caches config
    // at import time, and without this uploads would land in the default path.
    resetConfigCache();
    await connectToDatabase();
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ResumeAnalysisModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
    }
    const reg1 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'resume1@test.com', password: 'password123' });
    expect(reg1.status).toBe(201);
    user1Token = reg1.body.data.access_token;
    const reg2 = await request(app).post(`${API_BASE}/auth/register`).send({ email: 'resume2@test.com', password: 'password123' });
    expect(reg2.status).toBe(201);
    user2Token = reg2.body.data.access_token;
    user1Id = (await UserModel.findOne({ email: 'resume1@test.com' }).exec())!._id;
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await JobModel.deleteMany({}).exec();
      await SavedJobModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ResumeAnalysisModel.deleteMany({}).exec();
      await ApplicationModel.deleteMany({}).exec();
      await ApplicationEventModel.deleteMany({}).exec();
    }
    fs.rmSync(storageDir, { recursive: true, force: true });
    fs.mkdirSync(storageDir, { recursive: true });
  });

  afterAll(async () => {
    fs.rmSync(storageDir, { recursive: true, force: true });
    delete process.env.RESUME_STORAGE_PATH;
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  function storedFiles(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else found.push(full);
      }
    };
    walk(storageDir);
    return found;
  }

  describe('upload', () => {
    it('accepts an authenticated PDF upload with correct metadata', async () => {
      const res = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', PDF_BYTES, 'resume.pdf')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.resume.originalFilename).toBe('resume.pdf');
      expect(res.body.data.resume.status).toBe('ready');
      expect(res.body.data.resume.isDefault).toBe(true);
      expect(res.body.data.analysis.status).toBe('pending');
      expect(mongoose.Types.ObjectId.isValid(res.body.data.resume.id)).toBe(true);

      const doc = await ResumeModel.findById(res.body.data.resume.id).lean().exec();
      expect(doc).toBeDefined();
      expect(doc!.fileSize).toBe(PDF_BYTES.length);
      expect(doc!.version).toBe(1);
      expect(doc!.userId.toString()).toBe(user1Id.toString());
      expect(fs.existsSync(path.join(storageDir, doc!.storageKey))).toBe(true);
    });

    it('accepts a DOCX upload and marks only the first resume default', async () => {
      await request(app).post(`${API_BASE}/resumes`).set(withAuth(user1Token)).attach('file', PDF_BYTES, 'a.pdf').expect(201);
      const second = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', DOCX_BYTES, 'b.docx')
        .expect(201);

      expect(second.body.data.resume.isDefault).toBe(false);
      const list = await request(app).get(`${API_BASE}/resumes`).set(withAuth(user1Token)).expect(200);
      expect(list.body.data).toHaveLength(2);
    });

    it('rejects anonymous uploads', async () => {
      await request(app).post(`${API_BASE}/resumes`).attach('file', PDF_BYTES, 'resume.pdf').expect(401);
    });

    it('rejects unsupported extensions', async () => {
      const res = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', TEXT_BYTES, 'notes.txt')
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects content that does not match its container', async () => {
      // Plain text masquerading as PDF.
      const fakePdf = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', TEXT_BYTES, 'fake.pdf')
        .expect(422);
      expect(fakePdf.body.error.code).toBe('VALIDATION_ERROR');

      // ZIP bytes masquerading as PDF.
      const mismatched = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', DOCX_BYTES, 'fake.pdf')
        .expect(422);
      expect(mismatched.body.error.message).toContain('does not match');
    });

    it('rejects path traversal filenames at the service layer', async () => {
      // Multipart transport normalizes '../evil.pdf', so traversal defense is
      // verified where it matters: the service rejects hostile names even
      // when called directly, and stored keys never contain them.
      await expect(
        uploadResume(user1Id, PDF_BYTES, '../evil.pdf', 'application/pdf'),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const res = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', PDF_BYTES, 'evil.pdf')
        .expect(201);
      const doc = await ResumeModel.findById(res.body.data.resume.id).lean().exec();
      expect(doc!.storageKey).not.toContain('..');
      expect(doc!.storageKey.startsWith(`${user1Id.toString()}/`)).toBe(true);
    });

    it('rejects empty files and missing file fields', async () => {
      await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', Buffer.alloc(0), 'empty.pdf')
        .expect(422);

      const missing = await request(app).post(`${API_BASE}/resumes`).set(withAuth(user1Token)).send({});
      expect(missing.status).toBe(422);
    });

    it('rejects oversized files with 413', async () => {
      const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(11 * 1024 * 1024, 0x41)]);
      const res = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', big, 'big.pdf')
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('analysis', () => {
    it('extracts text and skills from an uploaded DOCX', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', DOCX_BYTES, 'resume.docx')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;

      const analyzed = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/analyze`)
        .set(withAuth(user1Token))
        .expect(200);
      expect(analyzed.body.data.success).toBe(true);

      const analysis = await request(app)
        .get(`${API_BASE}/resumes/${resumeId}/analysis`)
        .set(withAuth(user1Token))
        .expect(200);
      expect(analysis.body.data.status).toBe('completed');
      expect(analysis.body.data.extractedText).toContain('Ada Lovelace');
      const skillNames = (analysis.body.data.structuredData.skills as Array<{ name: string }>).map((s) => s.name.toLowerCase());
      expect(skillNames).toContain('typescript');
    });

    it('marks corrupt PDFs failed with a warning instead of crashing', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', GARBAGE_PDF_BYTES, 'corrupt.pdf')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;

      const analyzed = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/analyze`)
        .set(withAuth(user1Token));
      expect(analyzed.status).toBe(422);
      expect(analyzed.body.error.code).toBe('VALIDATION_ERROR');

      const analysis = await request(app)
        .get(`${API_BASE}/resumes/${resumeId}/analysis`)
        .set(withAuth(user1Token))
        .expect(200);
      expect(analysis.body.data.status).toBe('failed');
      expect(analysis.body.data.warnings.length).toBeGreaterThan(0);
    });

    it('retries failed analysis and enforces ownership', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', GARBAGE_PDF_BYTES, 'corrupt.pdf')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;
      await request(app).post(`${API_BASE}/resumes/${resumeId}/analyze`).set(withAuth(user1Token));

      const retry = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/analysis/retry`)
        .set(withAuth(user1Token));
      expect(retry.status).toBe(422);

      await request(app).post(`${API_BASE}/resumes/${resumeId}/analyze`).set(withAuth(user2Token)).expect(404);
      await request(app).get(`${API_BASE}/resumes/${resumeId}/analysis`).set(withAuth(user2Token)).expect(404);
    });
  });

  describe('import to profile', () => {
    async function analyzedDocx(token: string) {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(token))
        .attach('file', DOCX_BYTES, 'resume.docx')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;
      await request(app).post(`${API_BASE}/resumes/${resumeId}/analyze`).set(withAuth(token)).expect(200);
      return resumeId;
    }

    it('adds new skills without duplicating on re-import', async () => {
      await request(app)
        .post(`${API_BASE}/profile`)
        .set(withAuth(user1Token))
        .send({ firstName: 'Ada', lastName: 'L', skills: [{ name: 'Python' }] })
        .expect(201);
      const resumeId = await analyzedDocx(user1Token);

      const first = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['skills'] })
        .expect(200);
      expect(first.body.data.imported).toContain('skills');

      const profile = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      const names = (profile.body.data.skills as Array<{ name: string }>).map((s) => s.name.toLowerCase());
      expect(names).toContain('python');
      expect(names).toContain('typescript');

      const second = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['skills'] })
        .expect(200);
      expect(second.body.data.imported).toContain('skills');
      const after = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      const afterNames = (after.body.data.skills as Array<{ name: string }>).map((s) => s.name.toLowerCase());
      expect(afterNames.filter((n) => n === 'typescript')).toHaveLength(1);
    });

    it('never overwrites verified profile data; reports conflicts', async () => {
      await request(app)
        .post(`${API_BASE}/profile`)
        .set(withAuth(user1Token))
        .send({ firstName: 'Verified', lastName: 'Name', professionalSummary: 'My own summary' })
        .expect(201);
      const resumeId = await analyzedDocx(user1Token);

      const res = await request(app)
        .post(`${API_BASE}/resumes/${resumeId}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['personal', 'summary', 'bogus'] })
        .expect(200);

      // Verified values preserved; empty email filled from the resume.
      const profile = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(profile.body.data.firstName).toBe('Verified');
      expect(profile.body.data.lastName).toBe('Name');
      expect(profile.body.data.professionalSummary).toBe('My own summary');
      expect(profile.body.data.email).toBe('ada@fictional.test');
      expect(res.body.data.imported).toContain('personal');
      expect(res.body.data.conflicts.join(' ')).toContain('personal');
      // The fixture has no summary section, so summary is skipped, not conflicted.
      expect(res.body.data.skipped).toContain('summary');
      expect(res.body.data.skipped).toContain('bogus');
    });

    it('fills an empty summary but preserves a verified one', async () => {
      const resume = await ResumeModel.create({
        userId: user1Id,
        originalFilename: 'r.pdf',
        storedFilename: 's.pdf',
        mimeType: 'application/pdf',
        fileSize: 10,
        storageKey: 'k',
        status: 'ready',
      });
      const { ResumeAnalysisModel } = await import('../src/models/Resume.js');
      await ResumeAnalysisModel.create({
        resumeId: resume._id,
        userId: user1Id,
        status: 'completed',
        extractedText: 'text',
        structuredData: { summary: 'Parsed summary from file' },
        warnings: [],
        confidence: 'medium',
      });

      // Empty profile summary fills from analysis.
      await request(app)
        .post(`${API_BASE}/profile`)
        .set(withAuth(user1Token))
        .send({ firstName: 'Ada', lastName: 'L' })
        .expect(201);
      const filled = await request(app)
        .post(`${API_BASE}/resumes/${resume._id.toString()}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['summary'] })
        .expect(200);
      expect(filled.body.data.imported).toContain('summary');
      const afterFill = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(afterFill.body.data.professionalSummary).toBe('Parsed summary from file');

      // A verified summary is preserved and reported as a conflict.
      await request(app)
        .put(`${API_BASE}/profile`)
        .set(withAuth(user1Token))
        .send({ firstName: 'Ada', lastName: 'L', professionalSummary: 'My own summary' })
        .expect(200);
      const conflicted = await request(app)
        .post(`${API_BASE}/resumes/${resume._id.toString()}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['summary'] })
        .expect(200);
      expect(conflicted.body.data.conflicts.join(' ')).toContain('summary');
      const afterConflict = await request(app).get(`${API_BASE}/profile`).set(withAuth(user1Token)).expect(200);
      expect(afterConflict.body.data.professionalSummary).toBe('My own summary');
    });

    it('requires a completed analysis before import', async () => {      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', DOCX_BYTES, 'resume.docx')
        .expect(201);
      const res = await request(app)
        .post(`${API_BASE}/resumes/${uploaded.body.data.resume.id}/import`)
        .set(withAuth(user1Token))
        .send({ fields: ['skills'] })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ownership, download, delete, and failure cleanup', () => {
    it('isolates resumes per user', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', PDF_BYTES, 'mine.pdf')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;

      await request(app).get(`${API_BASE}/resumes/${resumeId}`).set(withAuth(user2Token)).expect(404);
      await request(app).get(`${API_BASE}/resumes/${resumeId}/download`).set(withAuth(user2Token)).expect(404);
      await request(app).delete(`${API_BASE}/resumes/${resumeId}`).set(withAuth(user2Token)).expect(404);

      const otherList = await request(app).get(`${API_BASE}/resumes`).set(withAuth(user2Token)).expect(200);
      expect(otherList.body.data).toHaveLength(0);
    });

    it('downloads the exact uploaded bytes', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', PDF_BYTES, 'mine.pdf')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;

      const res = await request(app)
        .get(`${API_BASE}/resumes/${resumeId}/download`)
        .set(withAuth(user1Token))
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(Buffer.compare(res.body as Buffer, PDF_BYTES)).toBe(0);
    });

    it('soft-deletes metadata and removes the stored file together', async () => {
      const uploaded = await request(app)
        .post(`${API_BASE}/resumes`)
        .set(withAuth(user1Token))
        .attach('file', PDF_BYTES, 'mine.pdf')
        .expect(201);
      const resumeId = uploaded.body.data.resume.id as string;
      expect(storedFiles()).toHaveLength(1);

      await request(app).delete(`${API_BASE}/resumes/${resumeId}`).set(withAuth(user1Token)).expect(200);
      const doc = await ResumeModel.findById(resumeId).lean().exec();
      expect(doc!.status).toBe('deleted');
      expect(storedFiles()).toHaveLength(0);

      // Soft-deleted resumes disappear from the listing.
      const list = await request(app).get(`${API_BASE}/resumes`).set(withAuth(user1Token)).expect(200);
      expect(list.body.data).toHaveLength(0);
    });

    it('removes the stored file when the database write fails', async () => {
      const { LocalStorageProvider } = await import('../src/storage/LocalStorageProvider.js');
      const storage = new LocalStorageProvider(storageDir);
      const failingResumes = {
        countByUserId: async () => 0,
        create: async () => {
          throw new Error('simulated database failure');
        },
      } as unknown as ResumeRepository;

      await expect(
        uploadResume(user1Id, PDF_BYTES, 'resume.pdf', 'application/pdf', { storage, resumes: failingResumes }),
      ).rejects.toThrow('simulated database failure');
      expect(await ResumeModel.countDocuments({ userId: user1Id }).exec()).toBe(0);
      expect(storedFiles()).toHaveLength(0);
    });

    it('surfaces storage failures without persisting metadata', async () => {
      const failingStorage = {
        save: async () => {
          throw new Error('simulated storage failure');
        },
        get: async () => null,
        delete: async () => undefined,
        exists: async () => false,
        getUrl: async () => '',
      };
      await expect(
        uploadResume(user1Id, PDF_BYTES, 'resume.pdf', 'application/pdf', { storage: failingStorage }),
      ).rejects.toThrow('simulated storage failure');
      expect(await ResumeModel.countDocuments({ userId: user1Id }).exec()).toBe(0);
    });
  });
});
