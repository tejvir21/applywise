/**
 * Section-aware parser regression tests, built around a fictional UI/UX
 * resume fixture that reproduces the reported failure mode (project titles,
 * date ranges, names, and locations promoted to skills, plus invented
 * proficiency levels).
 *
 * The fixture is input data, not a special case: assertions target general
 * parser behavior (dictionary-only verification, review queue, normalization,
 * evidence, contact/location/link rules).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { extractStructuredResume } from '../src/resume/parser/structured.js';
import { DocxResumeParser } from '../src/resume/parser/DocxResumeParser.js';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ResumeAnalysisModel } from '../src/models/Resume.js';
import { UserModel } from '../src/models/User.js';
import {
  analyzeResume,
  getAnalysis,
  importToProfile,
} from '../src/services/ResumeService.js';
import type { StorageProvider } from '../src/storage/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(here, 'fixtures', 'chirag-pandit-resume.txt'), 'utf8');

/** Reported garbage that must never appear as verified skills. */
const FORBIDDEN_SKILLS = [
  'pandit09 2021',
  '2025 2020',
  '2021 2018',
  'Noida June 3',
  '2025 Team Collaboration Landing Page',
  'Webflow Gym Web Page',
  'MERN Pay',
  'App',
];

function skillNames(parse: ReturnType<typeof extractStructuredResume>): string[] {
  return parse.skills.map((s) => s.name);
}

/** Minimal multi-line PDF (verified: pdf-parse preserves line breaks). */
function buildMultilinePdf(lines: string[]): Buffer {
  const ops = lines.map((t, i) => {
    const esc = t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    return `BT /F1 12 Tf 72 ${720 - i * 14} Td (${esc}) Tj ET`;
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

/** Minimal in-memory storage double. */
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

describe('section-aware resume parsing (Chirag Pandit fixture)', () => {
  it('extracts valid UI/UX and technical skills with evidence', () => {
    const parse = extractStructuredResume(FIXTURE);
    const names = skillNames(parse);
    for (const expected of [
      'Figma',
      'Webflow',
      'Adobe XD',
      'Photoshop',
      'Illustrator',
      'HTML',
      'CSS',
      'JavaScript',
      'React',
      'Node.js',
      'MERN',
      'User Research',
      'Wireframing',
      'Prototyping',
    ]) {
      expect(names, `missing verified skill ${expected}`).toContain(expected);
    }
    for (const skill of parse.skills) {
      expect(skill.evidence.length, `${skill.name} needs evidence`).toBeGreaterThan(0);
      expect(['skills', 'experience', 'projects', 'summary']).toContain(skill.section);
      expect(['skills_list', 'dictionary_match']).toContain(skill.method);
      expect(skill.reviewStatus).toBe('verified');
    }
    const figma = parse.skills.find((s) => s.name === 'Figma')!;
    expect(figma.section).toBe('skills');
    expect(figma.confidence).toBe('high');
  });

  it('never turns dates, names, locations, contact fragments, or project titles into skills', () => {
    const parse = extractStructuredResume(FIXTURE);
    const names = skillNames(parse);
    for (const forbidden of FORBIDDEN_SKILLS) {
      expect(names, `false skill: ${forbidden}`).not.toContain(forbidden);
    }
    expect(names).not.toContain('Team Collaboration');
    expect(names).not.toContain('Landing Page');
    expect(names).not.toContain('Gym Web Page');
    expect(names.some((n) => /\d/.test(n))).toBe(false);
    expect(names.some((n) => /noida|pandit|june|@|page|gym/i.test(n))).toBe(false);
    expect(names.some((n) => n.includes(' '))).toBe(true); // multi-word legit skills still allowed (User Research)
  });

  it('normalizes aliases and deduplicates case-insensitively', () => {
    const parse = extractStructuredResume(FIXTURE);
    const names = skillNames(parse);
    expect(names.filter((n) => n === 'React')).toHaveLength(1); // React.js + react -> React
    expect(names.filter((n) => n === 'CSS')).toHaveLength(1); // CSS + css -> CSS
    expect(names).toContain('Node.js'); // canonical display preserved, not "Node"
    expect(names).toContain('JavaScript');
    expect(names).not.toContain('TypeScript'); // present nowhere; never added by title
    // Preserved distinctions
    expect(names).toContain('HTML');
    expect(names).toContain('Figma');
    expect(names).toContain('Webflow');
  });

  it('holds uncertain terms for review instead of verifying or discarding them', () => {
    const parse = extractStructuredResume(FIXTURE);
    const review = parse.reviewCandidates.map((r) => r.text);
    expect(review).toContain('Team Collaboration');
    expect(review).toContain('Landing Page');
    for (const candidate of parse.reviewCandidates) {
      expect(candidate.reason.length).toBeGreaterThan(0);
    }
  });

  it('extracts contact details without treating them as skills', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.personal.email).toBe('chirag.pandit09@example.com');
    expect(parse.personal.phone).toContain('9876543210');
    expect(parse.personal.name).toBe('Chirag Pandit');
    expect(skillNames(parse).some((n) => /@|pandit09|98765/i.test(n))).toBe(false);
  });

  it('extracts an explicit current location but ignores employer locations', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.personal.city).toBe('Noida');
    expect(parse.personal.country).toBe('India');
    expect(parse.personal.location).toBe('Noida, India');
    expect(parse.personal.locationEvidence).toBe('Noida, India');
  });

  it('never promotes an employment location to the candidate location', () => {
    const text = [
      'Aarav Sharma',
      'Backend Developer',
      'aarav.sharma@example.com',
      '',
      'Experience',
      'Backend Developer - PixelWorks Studio, Noida',
      '2021 - Present',
      'Built APIs with Node.js and PostgreSQL.',
    ].join('\n');
    const parse = extractStructuredResume(text);
    expect(parse.personal.city).toBeUndefined();
    expect(parse.personal.location).toBeUndefined();
    expect(skillNames(parse)).toContain('Node.js');
  });

  it('maps LinkedIn, GitHub, and portfolio URLs to the right fields', () => {
    const parse = extractStructuredResume(FIXTURE);
    expect(parse.links.linkedin).toBe('https://linkedin.com/in/chiragpandit09');
    expect(parse.links.github).toBe('https://github.com/chiragp-design');
    expect(parse.links.portfolio).toBe('https://chiragpandit.design/');
  });

  it('rejects unsafe URL schemes with a warning and stores nothing', () => {
    const parse = extractStructuredResume(
      ['Jane Doe', 'jane@example.com', 'Skills', 'Figma', 'See javascript:alert(1) for more'].join('\n'),
    );
    const urls = [parse.links.github, parse.links.linkedin, parse.links.portfolio, parse.links.website, ...(parse.links.other ?? [])];
    expect(urls.every((u) => u === undefined)).toBe(true);
    expect(parse.warnings.some((w) => w.field === 'links')).toBe(true);
  });

  it('survives missing or malformed sections without crashing', () => {
    expect(() => extractStructuredResume('')).not.toThrow();
    const empty = extractStructuredResume('');
    expect(empty.skills).toEqual([]);
    expect(empty.warnings.length).toBeGreaterThan(0); // honest: nothing verifiable
    const headersOnly = extractStructuredResume('Skills\nExperience\nProjects\n');
    expect(headersOnly.skills).toEqual([]);
    // Unsectioned prose stays in the contact block and is never mined for
    // skills — conservative by design (contact text holds names/emails).
    const noHeaders = extractStructuredResume('Just some prose about design work.');
    expect(noHeaders.skills).toEqual([]);
    expect(noHeaders.warnings.length).toBeGreaterThan(0);
  });

  it('reports low-quality extraction honestly instead of claiming high confidence', () => {
    const parse = extractStructuredResume('hello world '.repeat(10));
    expect(parse.skills).toEqual([]);
    expect(['low', 'uncertain']).toContain(
      parse.skills.length >= 3 && (parse.personal.email || parse.personal.phone) ? 'high' : 'low',
    );
  });

  it('behaves identically through the DOCX parser entry point', async () => {
    const parser = new DocxResumeParser();
    const structured = (await parser.extractStructuredData(FIXTURE)) as unknown as ReturnType<typeof extractStructuredResume>;
    expect(structured.skills.map((s) => s.name)).toContain('Figma');
    expect(structured.skills.map((s) => s.name)).not.toContain('App');
  });
});

describe('analysis + import safety (fixture-backed, live DB)', () => {
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
    const user = await UserModel.create({ email: 'chirag@test.com', passwordHash: 'x'.repeat(60) });
    userId = user._id;
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function seedResume() {
    const key = `${userId.toString()}/fixture-resume.pdf`;
    files.set(key, buildMultilinePdf(FIXTURE.split('\n')));
    const resume = await ResumeModel.create({
      userId,
      originalFilename: 'chirag.pdf',
      storedFilename: 'fixture-resume.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      storageKey: key,
      storageProvider: 'local',
      status: 'ready',
    });
    return resume;
  }

  it('re-analysis updates parsed results without replacing the original file', async () => {
    const resume = await seedResume();
    const before = Buffer.from(files.get(resume.storageKey)!);
    const first = await analyzeResume(userId, resume._id.toString(), { storage });
    expect(first.success).toBe(true);
    const analysis = (await getAnalysis(userId, resume._id.toString()))!;
    expect(analysis.parserVersion).toBe('2.0.0');
    const skills = (analysis.structuredData.skills as Array<{ name: string }>) ?? [];
    expect(skills.map((s) => s.name)).toContain('Figma');
    expect(skills.map((s) => s.name)).not.toContain('MERN Pay');
    // Stored bytes untouched by analysis.
    expect(Buffer.compare(files.get(resume.storageKey)!, before)).toBe(0);
    // Re-analysis (no re-upload) refreshes the record.
    const second = await analyzeResume(userId, resume._id.toString(), { storage });
    expect(second.success).toBe(true);
    expect(Buffer.compare(files.get(resume.storageKey)!, before)).toBe(0);
  });

  it('imports verified skills with unknown proficiency and preserves profile data', async () => {
    const resume = await seedResume();
    await analyzeResume(userId, resume._id.toString(), { storage });
    await CandidateProfileModel.create({
      userId,
      firstName: 'Verified',
      lastName: 'Name',
      professionalSummary: 'My own summary',
      location: 'Bengaluru, India',
      email: 'verified@example.com',
      skills: [{ name: 'Python', level: 'advanced' }],
      socialLinks: { github: 'https://github.com/verified' },
    });
    const result = await importToProfile(userId, resume._id.toString(), ['personal', 'skills', 'location', 'contact', 'links']);
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    // Verified profile values preserved; conflicts reported.
    expect(profile.firstName).toBe('Verified');
    expect(profile.location).toBe('Bengaluru, India');
    expect(profile.email).toBe('verified@example.com');
    expect(profile.socialLinks?.github).toBe('https://github.com/verified');
    expect(result.conflicts.join(' ')).toMatch(/personal|location|contact|links/);
    // Imported skills carry no invented proficiency.
    const figma = profile.skills.find((s) => s.name === 'Figma');
    expect(figma).toBeDefined();
    expect(figma!.level).toBeUndefined();
    // Garbage never reaches the profile.
    expect(profile.skills.some((s) => /noida|2021|page|gym|app/i.test(s.name) && s.name !== 'App')).toBe(false);
    expect(profile.skills.some((s) => FORBIDDEN_SKILLS.includes(s.name))).toBe(false);
  });

  it('honors rejected review skills and reports conflicts explicitly', async () => {
    const resume = await seedResume();
    await analyzeResume(userId, resume._id.toString(), { storage });
    await CandidateProfileModel.create({ userId, firstName: 'Chirag', lastName: 'Pandit' });
    const result = await importToProfile(userId, resume._id.toString(), ['skills', 'location', 'contact', 'links'], {
      excludeSkills: ['Figma', 'webflow'],
    });
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    expect(profile.skills.some((s) => s.name === 'Figma')).toBe(false);
    expect(profile.skills.some((s) => s.name === 'Webflow')).toBe(false);
    expect(profile.skills.some((s) => s.name === 'HTML')).toBe(true);
    expect(result.skipped.join(' ')).toMatch(/rejected/i);
    // Empty profile fills location/contact/links from evidence.
    expect(profile.city).toBe('Noida');
    expect(profile.email).toBe('chirag.pandit09@example.com');
    expect(profile.socialLinks?.linkedin).toBe('https://linkedin.com/in/chiragpandit09');
  });

  it('keeps employment locations out of the profile on partial contact sections', async () => {
    const key = `${userId.toString()}/noloc.pdf`;
    files.set(
      key,
      buildMultilinePdf([
        'Aarav Sharma',
        'Backend Developer',
        'aarav.sharma@example.com',
        'Experience',
        'Backend Developer - PixelWorks Studio, Noida',
        '2021 - Present',
        'Built APIs with Node.js.',
      ]),
    );
    const resume = await ResumeModel.create({
      userId,
      originalFilename: 'aarav.pdf',
      storedFilename: 'noloc.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      storageKey: key,
      storageProvider: 'local',
      status: 'ready',
    });
    await analyzeResume(userId, resume._id.toString(), { storage });
    await CandidateProfileModel.create({ userId, firstName: 'Aarav', lastName: 'Sharma' });
    await importToProfile(userId, resume._id.toString(), ['location']);
    const profile = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
    expect(profile.city).toBeUndefined();
    expect(profile.location).toBeUndefined();
  });
});
