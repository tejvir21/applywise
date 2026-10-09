/**
 * Application material generation (Phase 7).
 *
 * Drafts are produced ONLY from verified stored data: the candidate's
 * profile, reviewed resume information (resume document + completed analysis
 * when present), and the job posting. Provider output is treated as
 * untrusted: it is JSON-parsed, Zod-validated, and then passed through
 * code-enforced honesty guards:
 * - tailored-resume `skillsUsed` is intersected with verified skills; dropped
 *   names are recorded as flagged gaps (never silently kept, never invented).
 * - required job skills missing from the verified record always produce
 *   flagged gaps, even if the model lists none.
 * - generated answers always enter as `verified: false` so the existing
 *   confirmation flow must clear them.
 *
 * Generation and editing are DRAFT-only and never change application status:
 * a draft can never become SUBMITTED (or trigger an attempt) through these
 * paths. The original resume document is never modified. Approved materials
 * are immutable because every mutating path requires DRAFT status.
 */

import { Types } from 'mongoose';
import { z } from 'zod';
import { getAIProvider, AIProviderError, type AIProvider } from '../ai/index.js';
import { ApplicationModel } from '../models/Application.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { ResumeAnalysisRepository } from '../repositories/ResumeAnalysisRepository.js';
import { CandidateProfileRepository } from '../repositories/CandidateProfileRepository.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';

const jobRepository = new JobRepository();
const resumeAnalysisRepository = new ResumeAnalysisRepository();
const candidateProfileRepository = new CandidateProfileRepository();
const applicationRepository = new ApplicationRepository();

const coverLetterOutputSchema = z.object({
  body: z.string().min(1).max(20000),
  flaggedGaps: z.array(z.string().max(1000)).default([]),
});

const resumeDraftOutputSchema = z.object({
  summary: z.string().min(1).max(5000),
  highlights: z.array(z.string().max(1000)).max(20).default([]),
  skillsUsed: z.array(z.string().max(100)).default([]),
  flaggedGaps: z.array(z.string().max(1000)).default([]),
});

const answerOutputSchema = z.object({
  answer: z.string().min(1).max(5000),
  needsConfirmation: z.boolean().default(true),
});

const SENSITIVE_QUESTION_PATTERN = /(authoriz|visa|sponsor|981f|citizen|disabilit|veteran|gender|ethnic|criminal|felony|salary|compensation|religion)/i;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
}

interface GenerationFacts {
  candidateName: string;
  headline: string;
  currentJobTitle: string;
  yearsOfExperience: number | null | undefined;
  skills: string[];
  requiredSkills: string[];
  missingSkills: string[];
  jobTitle: string;
  companyName: string;
  jobLocation: string;
  jobDescription: string;
  jobRequirements: string[];
  matchScore: number | null | undefined;
}

interface GenerationContext {
  applicationId: Types.ObjectId;
  userId: Types.ObjectId;
  profileUpdatedAt?: Date;
  resumeId?: Types.ObjectId;
  resumeVersion?: number;
  jobId: Types.ObjectId;
  facts: GenerationFacts;
}

async function gatherContext(userId: Types.ObjectId, applicationId: string): Promise<GenerationContext> {
  const appObjectId = new Types.ObjectId(applicationId);
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  const job = await jobRepository.findByIdAndUserId(app.jobId, userId);
  if (!job || (job as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', app.jobId.toString());
  }

  const profileSkills = (profile.skills ?? []).map((s) => norm(s.name)).filter(Boolean);
  let analysisSkills: string[] = [];
  if (app.resumeId) {
    const analysis = await resumeAnalysisRepository.findByResumeIdAndUserId(app.resumeId, userId);
    if (analysis && analysis.status === 'completed') {
      analysisSkills = (analysis.structuredData?.skills ?? []).map((s) => norm(s.name)).filter(Boolean);
    }
  }
  const skills = dedupe([...profileSkills, ...analysisSkills]);

  const requiredSkills = dedupe(
    ((job.requiredSkills ?? []) as Array<{ name: string }>).map((s) => norm(s.name)),
  );
  const skillSet = new Set(skills);
  const missingSkills = requiredSkills.filter((s) => !skillSet.has(s));

  const jobDoc = job as unknown as {
    title: string;
    companyName: string;
    location?: string;
    description?: string;
    requirements?: string[];
  };

  return {
    applicationId: appObjectId,
    userId,
    profileUpdatedAt: profile.updatedAt,
    resumeId: app.resumeId,
    resumeVersion: app.resumeVersion,
    jobId: app.jobId,
    facts: {
      candidateName: profile.displayName || `${profile.firstName} ${profile.lastName}`.trim(),
      headline: profile.headline ?? '',
      currentJobTitle: profile.currentJobTitle ?? '',
      yearsOfExperience: profile.yearsOfExperience ?? null,
      skills,
      requiredSkills,
      missingSkills,
      jobTitle: jobDoc.title,
      companyName: jobDoc.companyName,
      jobLocation: jobDoc.location ?? '',
      jobDescription: (jobDoc.description ?? '').slice(0, 2000),
      jobRequirements: (jobDoc.requirements ?? []).slice(0, 10),
      matchScore: app.matchScore,
    },
  };
}

function requireDraft(userId: Types.ObjectId, applicationId: string) {
  return (async () => {
    const app = await applicationRepository.findByIdAndUserId(new Types.ObjectId(applicationId), userId);
    if (!app) {
      throw new NotFoundError('Application', applicationId);
    }
    if (app.status !== 'DRAFT') {
      throw new ValidationError(`Materials can only change while the application is a DRAFT (current status: ${app.status})`, {
        status: app.status,
      });
    }
    return app;
  })();
}

function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AIProviderError('AI provider returned malformed output');
  }
}

function parseWith<T extends z.ZodTypeAny>(schema: T, text: string): z.infer<T> {
  const parsed = schema.safeParse(parseModelJson(text));
  if (!parsed.success) {
    throw new AIProviderError('AI provider returned malformed output');
  }
  return parsed.data;
}

function codeGaps(facts: GenerationFacts): string[] {
  const gaps = facts.missingSkills.map((s) => `No verified record of required skill: ${s}`);
  if (facts.skills.length === 0) {
    gaps.push('No verified skills recorded in the candidate profile');
  }
  return gaps;
}

async function recordProvenance(
  ctx: GenerationContext,
  provider: AIProvider,
  model: string,
  message: string,
  eventType: string,
) {
  await ApplicationModel.updateOne(
    { _id: ctx.applicationId, userId: ctx.userId },
    {
      $set: {
        materialsProvenance: {
          provider: provider.name,
          model,
          generatedAt: new Date(),
          profileUpdatedAt: ctx.profileUpdatedAt,
          resumeId: ctx.resumeId,
          resumeVersion: ctx.resumeVersion,
          jobId: ctx.jobId,
        },
      },
    },
  ).exec();
  await applicationRepository.logEvent({
    applicationId: ctx.applicationId,
    userId: ctx.userId,
    type: eventType,
    fromStatus: 'DRAFT',
    toStatus: 'DRAFT',
    message,
  });
}

const SYSTEM_PROMPT = [
  'You draft job-application materials from verified candidate facts only.',
  'Rules: use only the facts provided; never invent skills, employers, dates, achievements, degrees, certifications, or work authorization.',
  'If a fact is missing, say so in flaggedGaps instead of guessing.',
  'Respond with a single JSON document matching the requested shape. No prose outside the JSON.',
].join(' ');

export async function generateCoverLetter(
  userId: Types.ObjectId,
  applicationId: string,
  options: { replace?: boolean } = {},
  provider: AIProvider = getAIProvider(),
) {
  await requireDraft(userId, applicationId);
  const ctx = await gatherContext(userId, applicationId);
  const existing = await applicationRepository.findByIdAndUserId(ctx.applicationId, userId);
  if (existing?.materials?.coverLetter && !options.replace) {
    throw new ConflictError('A cover letter draft already exists; pass replace:true to regenerate', {
      field: 'coverLetter',
    });
  }

  const response = await provider.generateContent({
    kind: 'coverLetter',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Write a cover-letter body as JSON {"body": string, "flaggedGaps": string[]}. Facts: ${JSON.stringify(ctx.facts)}`,
    facts: ctx.facts as unknown as Record<string, unknown>,
  });
  const output = parseWith(coverLetterOutputSchema, response.text);
  const flaggedGaps = dedupe([...output.flaggedGaps, ...codeGaps(ctx.facts)]);

  // Store the draft body; gaps are advisory metadata returned to the caller
  // and recorded in the audit event (the schema keeps the draft itself lean).
  await ApplicationModel.updateOne(
    { _id: ctx.applicationId, userId },
    { $set: { 'materials.coverLetter': output.body } },
  ).exec();
  await recordProvenance(ctx, provider, response.model, `Cover letter draft generated (${flaggedGaps.length} flagged gap(s))`, 'cover_letter_generated');

  return { coverLetter: output.body, flaggedGaps, provider: provider.name, model: response.model };
}

export async function generateResumeDraft(
  userId: Types.ObjectId,
  applicationId: string,
  options: { replace?: boolean } = {},
  provider: AIProvider = getAIProvider(),
) {
  await requireDraft(userId, applicationId);
  const ctx = await gatherContext(userId, applicationId);
  const existing = await applicationRepository.findByIdAndUserId(ctx.applicationId, userId);
  if (existing?.materials?.tailoredResume?.summary && !options.replace) {
    throw new ConflictError('A tailored resume draft already exists; pass replace:true to regenerate', {
      field: 'tailoredResume',
    });
  }

  const response = await provider.generateContent({
    kind: 'resumeDraft',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Write a tailored resume draft as JSON {"summary": string, "highlights": string[], "skillsUsed": string[], "flaggedGaps": string[]}. Facts: ${JSON.stringify(ctx.facts)}`,
    facts: ctx.facts as unknown as Record<string, unknown>,
  });
  const output = parseWith(resumeDraftOutputSchema, response.text);

  // Fabrication guard: keep only verified skills; record every dropped name.
  const verified = new Set(ctx.facts.skills);
  const skillsUsed = dedupe(output.skillsUsed.filter((s) => verified.has(norm(s))));
  const dropped = dedupe(output.skillsUsed.filter((s) => !verified.has(norm(s))));
  const flaggedGaps = dedupe([
    ...output.flaggedGaps,
    ...codeGaps(ctx.facts),
    ...dropped.map((s) => `Removed unverified skill reference: ${s}`),
  ]);

  const draft = {
    summary: output.summary,
    highlights: output.highlights,
    skillsUsed,
    flaggedGaps,
    generatedAt: new Date(),
  };
  await ApplicationModel.updateOne(
    { _id: ctx.applicationId, userId },
    { $set: { 'materials.tailoredResume': draft } },
  ).exec();
  await recordProvenance(ctx, provider, response.model, `Tailored resume draft generated (${skillsUsed.length} verified skill(s), ${flaggedGaps.length} flagged gap(s))`, 'resume_draft_generated');

  return { tailoredResume: { ...draft, generatedAt: draft.generatedAt }, provider: provider.name, model: response.model };
}

export async function generateAnswer(
  userId: Types.ObjectId,
  applicationId: string,
  question: string,
  options: { replace?: boolean } = {},
  provider: AIProvider = getAIProvider(),
) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    throw new ValidationError('A question is required', { question });
  }
  await requireDraft(userId, applicationId);
  const ctx = await gatherContext(userId, applicationId);
  const existing = await applicationRepository.findByIdAndUserId(ctx.applicationId, userId);
  const answers = [...(existing?.materials?.answers ?? [])];
  const foundIndex = answers.findIndex((a) => norm(a.question) === norm(cleanQuestion));
  if (foundIndex >= 0 && !options.replace) {
    throw new ConflictError('An answer draft already exists; pass replace:true to regenerate', {
      field: 'answers',
      question: cleanQuestion,
    });
  }

  const relevant = ctx.facts.skills.filter(
    (s) => cleanQuestion.toLowerCase().includes(s) || ctx.facts.requiredSkills.includes(s),
  ).slice(0, 5);

  const response = await provider.generateContent({
    kind: 'answer',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Answer the application question as JSON {"answer": string, "needsConfirmation": true}. Question: ${cleanQuestion}. Facts: ${JSON.stringify({ ...ctx.facts, question: cleanQuestion, relevantSkills: relevant })}`,
    facts: { ...ctx.facts, question: cleanQuestion, relevantSkills: relevant } as Record<string, unknown>,
  });
  const output = parseWith(answerOutputSchema, response.text);

  const entry = {
    question: cleanQuestion,
    answer: output.answer,
    verified: false,
    sensitive: foundIndex >= 0
      ? answers[foundIndex].sensitive
      : SENSITIVE_QUESTION_PATTERN.test(cleanQuestion),
  };
  if (foundIndex >= 0) {
    answers[foundIndex] = entry;
  } else {
    answers.push(entry);
  }
  await ApplicationModel.updateOne(
    { _id: ctx.applicationId, userId },
    { $set: { 'materials.answers': answers } },
  ).exec();
  await recordProvenance(ctx, provider, response.model, `Answer draft generated for: ${cleanQuestion}`, 'answer_generated');

  return { answer: entry, provider: provider.name, model: response.model };
}

export interface UpdateMaterialsInput {
  coverLetter?: string;
  notes?: string;
  answers?: Array<{ question: string; answer: string; verified?: boolean; sensitive?: boolean }>;
  tailoredResume?: { summary?: string; highlights?: string[]; skillsUsed?: string[] };
}

export async function updateMaterials(userId: Types.ObjectId, applicationId: string, input: UpdateMaterialsInput) {
  const appObjectId = new Types.ObjectId(applicationId);
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (app.status !== 'DRAFT') {
    throw new ValidationError(`Materials can only change while the application is a DRAFT (current status: ${app.status})`, {
      status: app.status,
    });
  }

  const set: Record<string, unknown> = {};
  if (input.coverLetter !== undefined) set['materials.coverLetter'] = input.coverLetter;
  if (input.notes !== undefined) set['materials.notes'] = input.notes;
  if (input.answers !== undefined) {
    set['materials.answers'] = input.answers.map((a) => ({
      question: a.question,
      answer: a.answer,
      verified: a.verified ?? false,
      sensitive: a.sensitive ?? SENSITIVE_QUESTION_PATTERN.test(a.question),
    }));
  }
  if (input.tailoredResume !== undefined) {
    if (input.tailoredResume.summary !== undefined) set['materials.tailoredResume.summary'] = input.tailoredResume.summary;
    if (input.tailoredResume.highlights !== undefined) set['materials.tailoredResume.highlights'] = input.tailoredResume.highlights;
    // skillsUsed stays code-guarded: user edits may only narrow to verified skills.
    if (input.tailoredResume.skillsUsed !== undefined) {
      const profile = await candidateProfileRepository.findByUserId(userId);
      const known = new Set((profile?.skills ?? []).map((s) => norm(s.name)));
      const narrowed = dedupe(input.tailoredResume.skillsUsed.filter((s) => known.has(norm(s))));
      set['materials.tailoredResume.skillsUsed'] = narrowed;
    }
  }

  await ApplicationModel.updateOne({ _id: appObjectId, userId }, { $set: set }).exec();
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'materials_updated',
    fromStatus: 'DRAFT',
    toStatus: 'DRAFT',
    message: 'Draft materials edited by candidate',
  });
  const fresh = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  return fresh;
}

export async function markMaterialsReviewed(userId: Types.ObjectId, applicationId: string) {
  const appObjectId = new Types.ObjectId(applicationId);
  const app = await applicationRepository.findByIdAndUserId(appObjectId, userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  if (!['DRAFT', 'READY_FOR_REVIEW', 'AWAITING_APPROVAL'].includes(app.status)) {
    throw new ValidationError(`Materials cannot be marked reviewed in ${app.status} status`, { status: app.status });
  }
  await ApplicationModel.updateOne(
    { _id: appObjectId, userId },
    { $set: { materialsReviewedAt: new Date() } },
  ).exec();
  await applicationRepository.logEvent({
    applicationId: appObjectId,
    userId,
    type: 'materials_reviewed',
    fromStatus: app.status,
    toStatus: app.status,
    message: 'Candidate marked materials as reviewed (review only; no approval or submission)',
  });
  return applicationRepository.findByIdAndUserId(appObjectId, userId);
}

export async function getMaterials(userId: Types.ObjectId, applicationId: string) {
  const app = await applicationRepository.findByIdAndUserId(new Types.ObjectId(applicationId), userId);
  if (!app) {
    throw new NotFoundError('Application', applicationId);
  }
  return {
    materials: {
      coverLetter: app.materials?.coverLetter,
      answers: app.materials?.answers ?? [],
      notes: app.materials?.notes,
      tailoredResume: app.materials?.tailoredResume,
    },
    provenance: app.materialsProvenance,
    reviewedAt: app.materialsReviewedAt,
    status: app.status,
  };
}
