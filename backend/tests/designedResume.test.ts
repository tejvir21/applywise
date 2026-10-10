/**
 * Designed-template regression tests (second fixture).
 *
 * Covers a two-column "simple resume" layout whose PDF text extraction
 * yields: percentage-rated skills, a template placeholder address, repeated
 * phone numbers, duplicated education blocks, Lorem Ipsum filler, four
 * employment periods, and no social links.
 *
 * Assertions target general behavior — no names, addresses, or content from
 * any real resume are special-cased in the parser.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { extractStructuredResume, overallConfidenceFromEvidence } from '../src/resume/parser/structured.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ResumeAnalysisModel } from '../src/models/Resume.js';
import { UserModel } from '../src/models/User.js';
import { analyzeResume, getAnalysis, importToProfile } from '../src/services/ResumeService.js';
import type { StorageProvider } from '../src/storage/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(here, 'fixtures', 'designed-resume.txt'), 'utf8');

function memoryStorage(files: Map<string, Buffer>): StorageProvider {
  return {
    name: 'local',
    async save(key: string, data: Buffer | Readable) {
      if (Buffer.isBuffer(data)) {
        files.set(key, data);
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of data as unknown as AsyncIterable<Uint8Array | string>) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
        }
        files.set(key, Buffer.concat(chunks));
      }
    },
    async get(key: string) {
      const hit = files.get(key);
      return hit ? (Readable.from(hit) as unknown as NodeJS.ReadableStream) : null;
    },
    async delete(key: string) {
      files.delete(key);
    },
    async exists(key: string) {
      return files.has(key);
    },
    async getUrl() {
      throw new Error('Direct storage URLs are disabled for private resumes');
    },
  };
}

/** Minimal multi-line PDF (verified: pdf-parse preserves line breaks). */
function buildMultilinePdf(lines: string[]): Buffer {
  const ops = lines.map((t, i) => {
    const esc = t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    return `BT /F1 12 Tf 72 ${720 - i * 11} Td (${esc}) Tj ET`;
  });
  const content = ops.join('\n');
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

describe('designed-template parsing (placeholder-heavy fixture)', () => {
  it('extracts all six explicit skills with their source percentages', () => {
    const parse = extractStructuredResume(FIXTURE);
    const byName = new Map(parse.skills.map((s) => [s.name, s]));
    const expected: Array<[string, string]> = [
      ['UI/UX', '95%'],
      ['Wireframing', '90%'],
      ['Storyboards', '88%'],
      ['User Flows', '92%'],
      ['Process Flows', '85%'],
      ['Visual Design', '87%'],
    ];
    for (const [name, rating] of expected) {
      const skill = byName.get(name);
      expect(skill, `missing verified skill ${name}`).toBeDefined();
      expect(skill!.rating).toBe(rating);
      expect(skill!.reviewStatus).toBe('verified');
      expect(skill!.evidence.length).toBeGreaterThan(0);
      expect(skill!.section).toBe('skills');
      expect(skill!.method).toBe('skills_list');
    }
  });

  it('keeps percentages as evidence, never as proficiency', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.skills.every((s) => s.rating === undefined || /^\d{1,3}%$/.test(s.rating))).toBe(true);
    // Bare percentages are junk, not skills or candidates.
    const texts = [...parse.skills.map((s) => s.name), ...parse.reviewCandidates.map((r) => r.text)];
    expect(texts.some((t) => /^\d{1,3}\s*%$/.test(t))).toBe(false);
  });

  it('excludes Lorem Ipsum from skills, candidates, and summary', () => {
    const parse = extractStructuredResume(FIXTURE);
    const texts = [...parse.skills.map((s) => s.name), ...parse.reviewCandidates.map((r) => r.text)];
    expect(texts.some((t) => /lorem/i.test(t))).toBe(false);
    expect(parse.summary).toBeUndefined();
    expect(parse.warnings.some((w) => /lorem|placeholder/i.test(w.message))).toBe(true);
  });

  it('detects the template address and refuses it as a candidate location', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.personal.location).toBeUndefined();
    expect(parse.personal.city).toBeUndefined();
    expect(parse.personal.country).toBeUndefined();
    expect(parse.warnings.some((w) => w.field === 'personal.location' && /placeholder/i.test(w.message))).toBe(true);
  });

  it('deduplicates repeated education but preserves distinct qualifications', () => {
    const parse = extractStructuredResume(FIXTURE);
    const institutions = (parse.education as Array<{ institution?: string }>).map((e) => e.institution ?? '');
    expect(parse.education).toHaveLength(3);
    expect(institutions.some((i) => /National Institute of Design/i.test(i))).toBe(true);
    expect(institutions.some((i) => /IIT Bombay/i.test(i))).toBe(true);
    expect(institutions.some((i) => /NIFT/i.test(i))).toBe(true);
    expect(parse.warnings.some((w) => w.field === 'education' && /duplicate/i.test(w.message))).toBe(true);
  });

  it('keeps four distinct employment periods with locations inside entries', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.education).toHaveLength(3);
    expect(parse.experience).toHaveLength(4);
    const titles = (parse.experience as Array<{ title?: string }>).map((e) => e.title ?? '');
    expect(titles.some((t) => /Senior UI Designer/i.test(t))).toBe(true);
    expect(titles.some((t) => /Design Intern/i.test(t))).toBe(true);
    // Employment cities stay in entries, never become the profile location.
    expect(parse.personal.city).toBeUndefined();
  });

  it('collapses repeated phone numbers to a single contact value', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.personal.phone).toContain('98765');
    expect(parse.personal.phone).toBe('+91 98765 43210');
  });

  it('leaves missing social links absent without inventing any', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.links.github).toBeUndefined();
    expect(parse.links.linkedin).toBeUndefined();
    expect(parse.links.portfolio).toBeUndefined();
    expect(parse.links.website).toBeUndefined();
    expect(parse.links.other ?? []).toEqual([]);
  });

  it('caps confidence for placeholder-heavy extraction', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(['low', 'uncertain']).toContain(overallConfidenceFromEvidence(parse));
  });
});

describe('designed-template analysis + import (live DB)', () => {
  let userId: mongoose.Types.ObjectId;
  let files: Map<string, Buffer>;
  let storage: StorageProvider;

  beforeAll(async () => {
    await connectToDatabase();
    files = new Map();
    storage = memoryStorage(files);
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ResumeAnalysisModel.deleteMany({}).exec();
    }
    files.clear();
    const user = await UserModel.create({ email: 'designed@test.com', passwordHash: 'x'.repeat(60) });
    userId = user._id;
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function seedResume() {
    const key = `${userId.toString()}/designed.pdf`;
    const bytes = buildMultilinePdf(FIXTURE.split('\n'));
    files.set(key, bytes);
    const resume = await ResumeModel.create({
      userId,
      originalFilename: 'designed.pdf',
      storedFilename: 'designed.pdf',
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      storageKey: key,
      storageProvider: 'local',
      status: 'ready',
    });
    return { resume, bytes };
  }

  it('re-analysis preserves the uploaded file and existing profile values', async () => {
    const { resume, bytes } = await seedResume();
    await CandidateProfileModel.create({
      userId,
      firstName: 'Verified',
      lastName: 'Person',
      professionalSummary: 'My own summary',
      location: 'Bengaluru, India',
    });
    const first = await analyzeResume(userId, resume._id.toString(), { storage });
    expect(first.success).toBe(true);
    expect(Buffer.compare(files.get(resume.storageKey)!, bytes)).toBe(0);
    const second = await analyzeResume(userId, resume._id.toString(), { storage });
    expect(second.success).toBe(true);
    expect(Buffer.compare(files.get(resume.storageKey)!, bytes)).toBe(0);

    const result = await importToProfile(userId, resume._id.toString(), ['summary', 'location', 'skills', 'links']);
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    // Placeholder content never overwrites verified values.
    expect(profile.professionalSummary).toBe('My own summary');
    expect(profile.location).toBe('Bengaluru, India');
    expect(result.skipped.join(' ')).toMatch(/summary|location/);
    // Verified skills (with ratings) still import without proficiency.
    const uiux = profile.skills.find((s) => s.name === 'UI/UX');
    expect(uiux).toBeDefined();
    expect(uiux!.level).toBeUndefined();
    // No links to import.
    expect(result.skipped).toContain('links');
  });
});
