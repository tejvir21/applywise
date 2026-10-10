/**
 * Multi-template regression tests across three generalized layouts
 * (fictional data, no real names/employers/addresses special-cased):
 *  1. civil engineer — no Skills section; concepts live in summary,
 *     education, academic projects, and industrial training.
 *  2. administrative manager — explicit KEY SKILLS (technical + soft) and
 *     LANGUAGES sections with stated proficiency.
 *  3. designed two-column UI/UX — percentage skills, interleaved columns.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { extractStructuredResume } from '../src/resume/parser/structured.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ResumeAnalysisModel } from '../src/models/Resume.js';
import { UserModel } from '../src/models/User.js';
import { analyzeResume, getAnalysis, importToProfile } from '../src/services/ResumeService.js';
import type { StorageProvider } from '../src/storage/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CIVIL = fs.readFileSync(path.join(here, 'fixtures', 'civil-engineer.txt'), 'utf8');
const ADMIN = fs.readFileSync(path.join(here, 'fixtures', 'admin-manager.txt'), 'utf8');
const TWOCOL = fs.readFileSync(path.join(here, 'fixtures', 'designed-ux-2col.txt'), 'utf8');

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

describe('civil engineer layout (no Skills section)', () => {
  it('extracts technical and domain concepts from summary, education, projects, and training', () => {
    const parse = extractStructuredResume(CIVIL);
    const names = parse.skills.map((s) => s.name);
    for (const expected of [
      'AutoCAD',
      'STAAD Pro',
      'Surveying',
      'Estimation',
      'Structural Analysis',
      'RCC Design',
      'Soil Mechanics',
      'ETABS',
      'Primavera',
      'Quality Control',
    ]) {
      expect(names, `missing concept ${expected}`).toContain(expected);
    }
  });

  it('labels source section and method without inventing proficiency', () => {
    const parse = extractStructuredResume(CIVIL);
    const byName = new Map(parse.skills.map((s) => [s.name, s]));
    expect(byName.get('AutoCAD')).toMatchObject({ section: 'projects', method: 'dictionary_match' });
    expect(byName.get('Structural Analysis')).toMatchObject({ section: 'coursework', method: 'skills_list' });
    expect(byName.get('Quality Control')).toMatchObject({ section: 'experience', method: 'dictionary_match' });
    for (const skill of parse.skills) {
      expect(skill.evidence.length).toBeGreaterThan(0);
      expect(['skills_list', 'dictionary_match']).toContain(skill.method);
      expect('level' in skill).toBe(false);
      expect(skill.rating).toBeUndefined();
    }
    // Coursework keeps its category for the importer to exclude.
    expect(byName.get('Structural Analysis')?.category).toBe('coursework');
  });

  it('keeps training and employment as distinct periods with locations in entries', () => {
    const parse = extractStructuredResume(CIVIL);
    expect(parse.experience).toHaveLength(2);
    const titles = (parse.experience as Array<{ title?: string }>).map((e) => e.title ?? '');
    expect(titles.some((t) => /trainee/i.test(t))).toBe(true);
    expect(titles.some((t) => /site engineer/i.test(t))).toBe(true);
    const companies = (parse.experience as Array<{ company?: string; location?: string }>).map((e) => e.company ?? '');
    expect(companies.every((c) => /sharma constructions/i.test(c))).toBe(true);
    const locations = (parse.experience as Array<{ location?: string }>).map((e) => e.location);
    expect(locations).toContain('Pune');
    // Employment city is not the profile location extraction path.
    expect(parse.personal.city).toBe('Pune');
  });

  it('parses qualification, institution, dates, and honors distinctly', () => {
    const parse = extractStructuredResume(CIVIL);
    expect(parse.education).toHaveLength(1);
    const edu = parse.education[0] as Record<string, unknown>;
    expect(String(edu.degree ?? '')).toMatch(/civil/i);
    expect(String(edu.institution ?? '')).toMatch(/pune university/i);
    expect(edu.startDate).toBe('2017');
    expect(edu.endDate).toBe('2021');
    expect(String(edu.honors ?? '')).toMatch(/distinction/i);
  });
});

describe('administrative manager layout (KEY SKILLS + LANGUAGES)', () => {
  it('verifies explicit technical and soft skills with categories', () => {
    const parse = extractStructuredResume(ADMIN);
    const byName = new Map(parse.skills.map((s) => [s.name, s]));
    expect(byName.get('MS Excel')?.category).toBe('technical');
    expect(byName.get('SAP')?.category).toBe('technical');
    for (const soft of ['Communication', 'Leadership', 'Time Management', 'Problem Solving', 'Multitasking']) {
      expect(byName.get(soft)?.category, soft).toBe('soft');
    }
    for (const skill of parse.skills) {
      expect(skill.evidence.length).toBeGreaterThan(0);
    }
  });

  it('holds non-dictionary explicit terms for review instead of verifying or dropping', () => {
    const parse = extractStructuredResume(ADMIN);
    const names = parse.skills.map((s) => s.name);
    const review = parse.reviewCandidates.map((r) => r.text);
    for (const term of ['Tally', 'Data Entry', 'Office Administration']) {
      expect(names, `${term} must not auto-verify`).not.toContain(term);
      expect(review, `${term} must be preserved for review`).toContain(term);
    }
  });

  it('preserves stated language proficiency without mapping it to a level', () => {
    const parse = extractStructuredResume(ADMIN);
    const byName = new Map(parse.skills.map((s) => [s.name, s]));
    expect(byName.get('English')).toMatchObject({ category: 'language', proficiency: 'Fluent' });
    expect(byName.get('Hindi')).toMatchObject({ category: 'language', proficiency: 'Native' });
    expect(byName.get('Spanish')).toMatchObject({ category: 'language', proficiency: 'Basic' });
  });

  it('separates employer, title, dates, and location', () => {
    const parse = extractStructuredResume(ADMIN);
    expect(parse.experience).toHaveLength(2);
    const first = parse.experience[0] as Record<string, unknown>;
    expect(first.title).toBe('Administrative Manager');
    expect(first.company).toBe('Malabar Manufacturing');
    expect(first.location).toBe('Kochi');
    expect(first.startDate).toBe('2018');
  });
});

describe('two-column UI/UX layout (interleaved extraction order)', () => {
  it('recovers all six rated skills plus languages across columns', () => {
    const parse = extractStructuredResume(TWOCOL);
    const byName = new Map(parse.skills.map((s) => [s.name, s]));
    for (const [name, rating] of [
      ['UI/UX', '95%'],
      ['Wireframing', '90%'],
      ['Storyboards', '88%'],
      ['User Flows', '92%'],
      ['Process Flows', '85%'],
      ['Visual Design', '87%'],
    ] as Array<[string, string]>) {
      expect(byName.get(name)?.rating, name).toBe(rating);
    }
    expect(byName.get('English')?.category).toBe('language');
    expect(byName.get('Hindi')?.category).toBe('language');
  });

  it('uses the contact location, never a company line', () => {
    const parse = extractStructuredResume(TWOCOL);
    expect(parse.personal.city).toBe('Mumbai');
    expect(parse.personal.location).toBe('Mumbai, India');
    expect(parse.warnings.some((w) => w.field === 'personal.location')).toBe(false);
  });

  it('deduplicates repeated terms and splits experience from projects', () => {
    const parse = extractStructuredResume(TWOCOL);
    const names = parse.skills.map((s) => s.name);
    expect(names.filter((n) => n === 'Figma')).toHaveLength(1);
    expect(parse.experience.length).toBeGreaterThanOrEqual(1);
    const expTitles = (parse.experience as Array<{ title?: string }>).map((e) => e.title ?? '');
    expect(expTitles.some((t) => /product designer/i.test(t))).toBe(true);
  });
});

describe('multi-template import safety (live DB)', () => {
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
    const user = await UserModel.create({ email: 'multi@test.com', passwordHash: 'x'.repeat(60) });
    userId = user._id;
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function seedResume(text: string, filename: string) {
    const key = `${userId.toString()}/${filename}`;
    const bytes = buildMultilinePdf(text.split('\n'));
    files.set(key, bytes);
    const resume = await ResumeModel.create({
      userId,
      originalFilename: filename,
      storedFilename: filename,
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      storageKey: key,
      storageProvider: 'local',
      status: 'ready',
    });
    return { resume, bytes };
  }

  it('imports categorized skills without levels and never auto-imports coursework', async () => {
    const { resume } = await seedResume(ADMIN, 'admin.pdf');
    await analyzeResume(userId, resume._id.toString(), { storage });
    await CandidateProfileModel.create({ userId, firstName: 'Meera', lastName: 'Nair' });
    const result = await importToProfile(userId, resume._id.toString(), ['skills', 'location', 'contact']);
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    const excel = profile.skills.find((s) => s.name === 'MS Excel');
    expect(excel?.category).toBe('technical');
    expect(excel?.level).toBeUndefined();
    const comm = profile.skills.find((s) => s.name === 'Communication');
    expect(comm?.category).toBe('soft');
    expect(profile.city).toBe('Kochi');
    expect(profile.email).toBe('meera.nair@example.com');
    expect(result.conflicts).toEqual([]);

    const { resume: civil } = await seedResume(CIVIL, 'civil.pdf');
    await analyzeResume(userId, civil._id.toString(), { storage });
    const civilResult = await importToProfile(userId, civil._id.toString(), ['skills']);
    const after = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    expect(after.skills.some((s) => s.name === 'Structural Analysis')).toBe(false);
    expect(civilResult.skipped.join(' ')).toMatch(/coursework/i);
  });

  it('imports explicitly approved review terms and preserves conflicts', async () => {
    const { resume } = await seedResume(ADMIN, 'admin2.pdf');
    await analyzeResume(userId, resume._id.toString(), { storage });
    await CandidateProfileModel.create({
      userId,
      firstName: 'Meera',
      lastName: 'Nair',
      location: 'Bengaluru, India',
    });
    const result = await importToProfile(userId, resume._id.toString(), ['skills', 'location'], {
      includeReview: ['Tally'],
      excludeSkills: ['SAP'],
    });
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    expect(profile.skills.some((s) => s.name === 'Tally')).toBe(true);
    expect(profile.skills.some((s) => s.name === 'SAP')).toBe(false);
    expect(profile.location).toBe('Bengaluru, India');
    expect(result.conflicts.join(' ')).toMatch(/location/);
  });

  it('re-analysis preserves the uploaded file', async () => {
    const { resume, bytes } = await seedResume(CIVIL, 'civil2.pdf');
    await analyzeResume(userId, resume._id.toString(), { storage });
    await analyzeResume(userId, resume._id.toString(), { storage });
    expect(Buffer.compare(files.get(resume.storageKey)!, bytes)).toBe(0);
    const analysis = await getAnalysis(userId, resume._id.toString());
    expect(analysis?.parserVersion).toBe('2.0.0');
  });
});
