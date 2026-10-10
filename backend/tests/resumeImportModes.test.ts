/**
 * Selective import modes: fill-empty (default), selective update, and
 * review-all-changes, with merge/replace/individual skill handling,
 * concurrency preconditions, atomic writes, and account-email protection.
 * Fictional data, isolated in-memory database.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectDatabase, isDatabaseConnected } from '../src/config/database.js';
import { CandidateProfileModel, ResumeModel } from '../src/models/index.js';
import { ResumeAnalysisModel } from '../src/models/Resume.js';
import { UserModel } from '../src/models/User.js';
import { importToProfile } from '../src/services/ResumeService.js';

const STRUCTURED = {
  personal: {
    name: 'Chiara Fictional',
    email: 'chiara@new.test',
    phone: '+1 555 0100',
    location: 'Austin, TX',
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    locationEvidence: 'Austin, TX',
  },
  summary: 'New summary from the second resume.',
  skills: [
    { name: 'Figma', confidence: 'high', evidence: 'Figma', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'design' },
    { name: 'Webflow', confidence: 'high', evidence: 'Webflow', section: 'skills', method: 'skills_list', reviewStatus: 'verified', category: 'design' },
  ],
  reviewCandidates: [{ text: 'Tally', reason: 'unrecognized term', section: 'skills' }],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
  links: { linkedin: 'https://linkedin.com/in/new', github: 'https://github.com/new' },
};

describe('resume import modes', () => {
  let userId: mongoose.Types.ObjectId;
  let resumeId: string;

  beforeAll(async () => {
    await connectToDatabase();
  });

  beforeEach(async () => {
    if (isDatabaseConnected()) {
      await UserModel.deleteMany({}).exec();
      await CandidateProfileModel.deleteMany({}).exec();
      await ResumeModel.deleteMany({}).exec();
      await ResumeAnalysisModel.deleteMany({}).exec();
    }
    vi.restoreAllMocks();
    const user = await UserModel.create({ email: 'account@example.com', passwordHash: 'x'.repeat(60) });
    userId = user._id;
    const resume = await ResumeModel.create({
      userId,
      originalFilename: 'second.pdf',
      storedFilename: 'second.pdf',
      mimeType: 'application/pdf',
      fileSize: 100,
      storageKey: `${userId.toString()}/second.pdf`,
      storageProvider: 'local',
      status: 'ready',
    });
    resumeId = resume._id.toString();
    await ResumeAnalysisModel.create({
      resumeId: resume._id,
      userId,
      status: 'completed',
      extractedText: 'text',
      structuredData: JSON.parse(JSON.stringify(STRUCTURED)),
      warnings: [],
      confidence: 'high',
    });
  });

  afterAll(async () => {
    if (isDatabaseConnected()) {
      await disconnectDatabase();
    }
  });

  async function profile() {
    return (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
  }

  it('fill mode preserves existing values and reports conflicts', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'Kept',
      lastName: 'Name',
      professionalSummary: 'Existing summary',
      phone: '+1 555 0000',
      location: 'Old Town',
      skills: [{ name: 'Python', level: 'advanced' }],
    });
    const result = await importToProfile(userId, resumeId, ['personal', 'summary', 'contact', 'location', 'skills']);
    const after = await profile();
    expect(after.firstName).toBe('Kept');
    expect(after.professionalSummary).toBe('Existing summary');
    expect(after.phone).toBe('+1 555 0000');
    expect(after.location).toBe('Old Town');
    expect(after.skills.map((s) => s.name).sort()).toEqual(['Figma', 'Python', 'Webflow']);
    expect(result.conflicts.join(' ')).toMatch(/personal|summary|contact|location/);
    expect(result.applied).toEqual(expect.arrayContaining(['skills']));
    // Merge preserves the existing skill object (level intact, no duplicate).
    expect(after.skills.filter((s) => s.name === 'Python')).toHaveLength(1);
    expect(after.skills.find((s) => s.name === 'Python')?.level).toBe('advanced');
  });

  it('select mode changes only selected fields with confirmation', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'Meera',
      lastName: 'Nair',
      professionalSummary: 'Old summary',
      phone: '+1 555 0000',
    });
    const unconfirmed = await importToProfile(userId, resumeId, ['summary', 'contact'], { mode: 'select' });
    expect((await profile()).professionalSummary).toBe('Old summary');
    expect(unconfirmed.conflicts.join(' ')).toMatch(/not confirmed/);

    const result = await importToProfile(userId, resumeId, ['summary'], { mode: 'select', confirmReplace: true });
    const after = await profile();
    expect(after.professionalSummary).toBe('New summary from the second resume.');
    expect(after.phone).toBe('+1 555 0000'); // unselected: untouched
    expect(result.applied).toContain('summary.professionalSummary');
  });

  it('supports subkey paths so a single field can be replaced', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'A',
      lastName: 'B',
      location: 'Old Town',
      city: 'Oldville',
      country: 'USA',
    });
    const result = await importToProfile(userId, resumeId, ['location.city'], {
      mode: 'select',
      confirmReplace: true,
    });
    const after = await profile();
    expect(after.city).toBe('Austin');
    expect(after.location).toBe('Old Town');
    expect(after.country).toBe('USA');
    expect(result.applied).toContain('location.city');
  });

  it('review mode applies only approved fields', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'R',
      lastName: 'S',
      professionalSummary: 'Old summary',
      location: 'Old Town',
    });
    const result = await importToProfile(userId, resumeId, ['summary'], {
      mode: 'review',
      confirmReplace: true,
    });
    expect((await profile()).professionalSummary).toBe('New summary from the second resume.');
    expect((await profile()).location).toBe('Old Town');
    expect(result.applied).toContain('summary.professionalSummary');
  });

  it('merge deduplicates and preserves existing skills with stable ids', async () => {
    const created = await CandidateProfileModel.create({
      userId,
      firstName: 'M',
      lastName: 'N',
      skills: [{ name: 'Figma' }, { name: 'Python' }],
    });
    const figmaId = String(created.skills.find((s) => s.name === 'Figma')!._id);
    await importToProfile(userId, resumeId, ['skills'], { mode: 'select', confirmReplace: true });
    const after = await profile();
    expect(after.skills.map((s) => s.name).sort()).toEqual(['Figma', 'Python', 'Webflow']);
    expect(String(after.skills.find((s) => s.name === 'Figma')!._id)).toBe(figmaId);
    expect(after.skills.find((s) => s.name === 'Webflow')?.category).toBe('design');
    expect(after.skills.every((s) => s._id)).toBe(true);
    expect(after.skills.every((s) => (s as { level?: string }).level === undefined)).toBe(true);
  });

  it('replace swaps the list only with confirmation and reports removals', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'M',
      lastName: 'N',
      skills: [{ name: 'Cobol' }, { name: 'Figma' }],
    });
    const unconfirmed = await importToProfile(userId, resumeId, ['skills'], {
      mode: 'select',
      skillsMode: 'replace',
    });
    expect(unconfirmed.conflicts.join(' ')).toMatch(/replace not confirmed/);
    expect((await profile()).skills.map((s) => s.name).sort()).toEqual(['Cobol', 'Figma']);

    const result = await importToProfile(userId, resumeId, ['skills'], {
      mode: 'select',
      skillsMode: 'replace',
      confirmReplace: true,
    });
    const after = await profile();
    expect(after.skills.map((s) => s.name).sort()).toEqual(['Figma', 'Webflow']);
    expect(result.removed).toContain('Cobol');
    expect(result.applied).toContain('skills');
  });

  it('removes individually reviewed skills only with confirmation', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'M',
      lastName: 'N',
      skills: [{ name: 'Cobol' }, { name: 'Python' }],
    });
    const unconfirmed = await importToProfile(userId, resumeId, ['skills'], {
      mode: 'review',
      removeSkills: ['Cobol'],
    });
    expect(unconfirmed.conflicts.join(' ')).toMatch(/removal not confirmed/);
    // Merge additions still apply; only the removal is blocked.
    expect((await profile()).skills.map((s) => s.name)).toContain('Cobol');

    const result = await importToProfile(userId, resumeId, ['skills'], {
      mode: 'review',
      removeSkills: ['Cobol', 'MissingSkill'],
      confirmReplace: true,
    });
    // Merge still adds verified resume skills; only Cobol is removed.
    expect((await profile()).skills.map((s) => s.name).sort()).toEqual(['Figma', 'Python', 'Webflow']);
    expect(result.removed).toContain('Cobol');
    expect(result.removed).not.toContain('MissingSkill');
  });

  it('keeps rejected candidates out and imports approved review terms', async () => {
    await CandidateProfileModel.create({ userId, firstName: 'M', lastName: 'N' });
    const result = await importToProfile(userId, resumeId, ['skills'], {
      excludeSkills: ['Figma'],
      includeReview: ['Tally'],
    });
    const after = await profile();
    expect(after.skills.map((s) => s.name).sort()).toEqual(['Tally', 'Webflow']);
    expect(result.skipped.join(' ')).toMatch(/rejected/);
  });

  it('never changes the authentication account email', async () => {
    await CandidateProfileModel.create({ userId, firstName: 'M', lastName: 'N' });
    await importToProfile(userId, resumeId, ['contact', 'personal']);
    expect((await profile()).email).toBe('chiara@new.test');
    expect((await UserModel.findById(userId).lean().exec())!.email).toBe('account@example.com');
  });

  it('rejects unknown modes, invalid fields stay skipped, malformed values never write', async () => {
    await CandidateProfileModel.create({ userId, firstName: 'M', lastName: 'N' });
    await expect(importToProfile(userId, resumeId, ['skills'], { mode: 'bogus' as never })).rejects.toThrow(/Unknown import mode/);
    await expect(importToProfile(userId, resumeId, ['skills'], { skillsMode: 'bogus' as never })).rejects.toThrow(/Unknown skills mode/);
    const unknown = await importToProfile(userId, resumeId, ['bogus', 'alsobogus']);
    expect(unknown.skipped).toEqual(expect.arrayContaining(['bogus', 'alsobogus']));
    expect(unknown.applied).toEqual([]);
    // Malformed email in analysis is skipped, never written.
    await ResumeAnalysisModel.updateOne(
      { resumeId: new mongoose.Types.ObjectId(resumeId) },
      { $set: { 'structuredData.personal.email': 'not-an-email' } },
    ).exec();
    const result = await importToProfile(userId, resumeId, ['contact']);
    expect((await profile()).email).toBeUndefined();
    expect(result.skipped.join(' ')).toMatch(/invalid value/);
  });

  it('blocks cross-user resume and profile access', async () => {
    const stranger = await UserModel.create({ email: 'stranger@example.com', passwordHash: 'x'.repeat(60) });
    await expect(importToProfile(stranger._id, resumeId, ['summary'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await CandidateProfileModel.countDocuments({}).exec()).toBe(0);
  });

  it('honors concurrency preconditions instead of overwriting', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'M',
      lastName: 'N',
      phone: '+1 555 0000',
    });
    const fresh = await importToProfile(userId, resumeId, ['contact'], {
      mode: 'select',
      confirmReplace: true,
      expected: { phone: '+1 555 0000' },
    });
    expect(fresh.applied).toContain('contact.phone');
    expect((await profile()).phone).toBe('+1 555 0100');

    // Simulate a concurrent edit, then retry with the now-stale expectation.
    await CandidateProfileModel.updateOne({ userId }, { $set: { phone: '+1 555 9999' } }).exec();
    const stale = await importToProfile(userId, resumeId, ['contact'], {
      mode: 'select',
      confirmReplace: true,
      expected: { phone: '+1 555 0000' },
    });
    expect(stale.conflicts.join(' ')).toMatch(/changed since review/);
    expect((await profile()).phone).toBe('+1 555 9999');
    expect(stale.applied).not.toContain('contact.phone');
  });

  it('writes atomically: one update call, no partial changes on failure', async () => {
    await CandidateProfileModel.create({
      userId,
      firstName: 'M',
      lastName: 'N',
      professionalSummary: 'Old',
      phone: '+1 555 0000',
    });
    const before = await profile();
    // Spy at the Mongoose seam (stable interception point for all writers).
    const spy = vi.spyOn(CandidateProfileModel, 'findOneAndUpdate');
    const result = await importToProfile(userId, resumeId, ['personal', 'summary', 'contact', 'location', 'links', 'skills'], {
      mode: 'select',
      confirmReplace: true,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.applied.length).toBeGreaterThan(3);

    spy.mockRejectedValueOnce(new Error('simulated db failure'));
    // Make the retry attempt a real write again (different current values).
    await CandidateProfileModel.updateOne({ userId }, { $set: { professionalSummary: 'Old', phone: '+1 555 0000' } }).exec();
    const failed = await importToProfile(userId, resumeId, ['summary', 'contact'], { mode: 'select', confirmReplace: true });
    // Failed write: nothing applied, targets reported, profile untouched.
    expect(failed.applied).toEqual([]);
    expect(failed.conflicts.join(' ')).toMatch(/summary|contact/);
    const after = await profile();
    expect(after.professionalSummary).toBe('Old');
    expect(after.phone).toBe('+1 555 0000');
  });

  it('keeps the legacy call shape backward-compatible', async () => {
    await CandidateProfileModel.create({ userId, firstName: 'M', lastName: 'N' });
    const result = await importToProfile(userId, resumeId, ['skills']);
    expect(result.imported).toContain('skills');
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(Array.isArray(result.applied)).toBe(true);
    expect(Array.isArray(result.removed)).toBe(true);
  });

  it('runs the full second-resume workflow end to end', async () => {
    const { uploadResume, analyzeResume: analyze } = await import('../src/services/ResumeService.js');
    const { LocalStorageProvider } = await import('../src/storage/LocalStorageProvider.js');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'applywise-workflow-'));
    try {
      // 1. Profile with existing skills, summary, phone, and links.
      await CandidateProfileModel.create({
        userId,
        firstName: 'Alex',
        lastName: 'Rivera',
        professionalSummary: 'Old summary',
        phone: '+1 555 0000',
        skills: [{ name: 'Python' }],
        socialLinks: { github: 'https://github.com/kept' },
      });
      // 2. Upload and analyze a second resume (real PDF through storage).
      const lines = [
        'Alex Rivera', 'alex.rivera@example.com', '+1 555 234 5678', 'Austin, TX',
        'Summary', 'Senior backend engineer.',
        'Skills', 'TypeScript, Go',
        'Experience', 'Backend Engineer - Initech, Austin', '2020 - Present', 'Built APIs with TypeScript and Go.',
      ];
      const ops = lines.map((t, i) => `BT /F1 12 Tf 72 ${720 - i * 14} Td (${t}) Tj ET`);
      const content = ops.join('\n');
      const objects = [
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
      const xref = Buffer.byteLength(out);
      out += `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
      const pdf = Buffer.from(out, 'latin1');
      const storage = new LocalStorageProvider(dir);
      const uploaded = await uploadResume(userId, pdf, 'second.pdf', 'application/pdf', { storage });
      const secondId = uploaded.resume.id as string;
      await analyze(userId, secondId, { storage });

      // 3. Preview differences without applying (select, no confirmation).
      const preview = await importToProfile(userId, secondId, ['summary', 'contact'], { mode: 'select' });
      expect(preview.conflicts.join(' ')).toMatch(/summary|contact/);
      expect(preview.applied).not.toContain('summary.professionalSummary');
      const untouched = await profile();
      expect(untouched.professionalSummary).toBe('Old summary');
      expect(untouched.phone).toBe('+1 555 0000');

      // 4. Merge approved new skills (existing Python retained).
      const merged = await importToProfile(userId, secondId, ['skills'], { mode: 'select', confirmReplace: true });
      expect(merged.applied).toContain('skills');
      expect((await profile()).skills.map((s) => s.name).sort()).toEqual(['Go', 'Python', 'TypeScript']);

      // 5. Selectively replace the summary and phone.
      const replaced = await importToProfile(userId, secondId, ['summary', 'contact.phone'], {
        mode: 'select',
        confirmReplace: true,
      });
      expect(replaced.applied).toEqual(expect.arrayContaining(['summary.professionalSummary', 'contact.phone']));
      const afterReplace = await profile();
      expect(afterReplace.professionalSummary).toBe('Senior backend engineer.');
      expect(afterReplace.phone).toBe('+1 555 234 5678');

      // 6. The authentication account email is unchanged.
      expect(afterReplace.email).toBe('alex.rivera@example.com');
      expect((await UserModel.findById(userId).lean().exec())!.email).toBe('account@example.com');

      // 7. A separate confirmed skill replacement.
      const swap = await importToProfile(userId, secondId, ['skills'], {
        mode: 'select',
        skillsMode: 'replace',
        confirmReplace: true,
      });
      expect((await profile()).skills.map((s) => s.name).sort()).toEqual(['Go', 'TypeScript']);
      expect(swap.removed).toContain('Python');

      // 8. Reload and verify persisted data.
      const reloaded = (await CandidateProfileModel.findOne({ userId }).lean().exec())!;
      expect(reloaded.professionalSummary).toBe('Senior backend engineer.');
      expect(reloaded.phone).toBe('+1 555 234 5678');
      expect(reloaded.skills.map((s) => s.name).sort()).toEqual(['Go', 'TypeScript']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
