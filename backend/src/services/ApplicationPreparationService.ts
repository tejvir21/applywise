/**
 * Application preparation service (Phase 8.3.13).
 *
 * Candidate-owned preparation workflow: tailor a resume, write a cover
 * letter, prepare answers to application questions, then review and approve
 * the package. Nothing here submits an application — there is no
 * SUBMITTING/SUBMITTED state.
 *
 * AI output is untrusted until validated: structured output is Zod-validated,
 * malformed output is rejected, and candidate approval is an explicit
 * operation. Generation failures preserve existing draft data.
 */

import { Types } from 'mongoose';
import { z } from 'zod';
import { getAIProvider, AIProviderError, type AIProvider } from '../ai/index.js';
import {
  ApplicationPreparationModel,
  type IApplicationPreparation,
  type ComponentReviewStatus,
  type AnswerReviewStatus,
  PreparationStatus,
  canTransition,
  allComponentsApproved,
} from '../models/ApplicationPreparation.js';
import { ApplicationPreparationRepository } from '../repositories/ApplicationPreparationRepository.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { ResumeAnalysisRepository } from '../repositories/ResumeAnalysisRepository.js';
import { CandidateProfileRepository } from '../repositories/CandidateProfileRepository.js';
import { computeJobMatch, type MatchableJob, type MatchableProfile } from './JobMatchingService.js';
import { assessJobReadiness } from './ProfileReadinessService.js';
import {
  VerificationStatus,
  VerificationResult,
  factVerificationService,
} from './FactVerificationService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';

const preparationRepository = new ApplicationPreparationRepository();
const jobRepository = new JobRepository();
const resumeRepository = new ResumeRepository();
const resumeAnalysisRepository = new ResumeAnalysisRepository();
const candidateProfileRepository = new CandidateProfileRepository();

/** Zod schemas for AI output validation (mirror MaterialGenerationService). */
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

const SENSITIVE_QUESTION_PATTERN = /(authoriz|visa|sponsor|citizen|disabilit|veteran|gender|ethnic|criminal|felony|salary|compensation|religion)/i;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))];
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

function codeGaps(facts: { requiredSkills: string[]; skills: string[] }): string[] {
  const skillSet = new Set(facts.skills.map((s) => norm(s)));
  return facts.requiredSkills
    .filter((s) => !skillSet.has(norm(s)))
    .map((s) => `No verified record of required skill: ${s}`);
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
}

export type { GenerationFacts };

interface GenerationContext {
  preparationId: Types.ObjectId;
  userId: Types.ObjectId;
  profileUpdatedAt?: Date;
  resumeId?: Types.ObjectId;
  resumeVersion?: number;
  resumeUpdatedAt?: Date;
  jobId: Types.ObjectId;
  facts: GenerationFacts;
}

async function gatherContext(
  userId: Types.ObjectId,
  jobId: string,
  prep: IApplicationPreparation,
): Promise<GenerationContext> {
  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  const job = await jobRepository.findById(jobId);
  if (!job || (job as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', jobId);
  }

  // Fetch resume metadata for provenance tracking
  const resumeId = prep.resumeId;
  let resumeUpdatedAt: Date | undefined;
  let resumeVersion = prep.resumeVersion;
  let analysisSkills: string[] = [];
  if (resumeId) {
    const resume = await resumeRepository.findByIdAndUserId(resumeId, userId);
    if (resume) {
      resumeUpdatedAt = resume.updatedAt;
      resumeVersion = resume.version;
    }
    const analysis = await resumeAnalysisRepository.findByResumeIdAndUserId(resumeId, userId);
    if (analysis && analysis.status === 'completed') {
      analysisSkills = (analysis.structuredData?.skills ?? []).map((s) => norm(s.name)).filter(Boolean);
    }
  }

  const profileSkills = (profile.skills ?? []).map((s) => norm(s.name)).filter(Boolean);
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
    preparationId: prep._id,
    userId,
    profileUpdatedAt: profile.updatedAt,
    resumeId: prep.resumeId,
    resumeVersion,
    resumeUpdatedAt,
    jobId: prep.jobId,
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
    },
  };
}

/** Build GenerationFacts from a preparation for cross-component consistency checks.
 * Fetches the candidate profile and job to ground verification in verified facts. */
async function buildFactsFromPrep(
  userId: Types.ObjectId,
  prep: IApplicationPreparation,
): Promise<GenerationFacts> {
  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  const job = await jobRepository.findById(prep.jobId.toString());
  if (!job || (job as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', prep.jobId.toString());
  }

  const profileSkills = (profile.skills ?? []).map((s) => norm(s.name)).filter(Boolean);
  const requiredSkills = dedupe(
    ((job.requiredSkills ?? []) as Array<{ name: string }>).map((s) => norm(s.name)),
  );
  const skillSet = new Set(profileSkills);
  const missingSkills = requiredSkills.filter((s) => !skillSet.has(s));

  return {
    candidateName: profile.displayName || `${profile.firstName} ${profile.lastName}`.trim(),
    headline: profile.headline ?? '',
    currentJobTitle: profile.currentJobTitle ?? '',
    yearsOfExperience: profile.yearsOfExperience ?? null,
    skills: profileSkills,
    requiredSkills,
    missingSkills,
    jobTitle: job.title,
    companyName: job.companyName,
    jobLocation: job.location ?? '',
    jobDescription: (job.description ?? '').slice(0, 2000),
    jobRequirements: (job.requirements ?? []).slice(0, 10),
  };
}

function requireStatus(
  prep: IApplicationPreparation,
  allowed: PreparationStatus[],
): void {
  if (!allowed.includes(prep.status)) {
    throw new ValidationError(
      `Operation not allowed in ${prep.status} status (allowed: ${allowed.join(', ')})`,
      { status: prep.status, allowed },
    );
  }
}

async function recordProvenance(
  ctx: GenerationContext,
  provider: AIProvider,
  model: string,
  message: string,
  eventType: string,
): Promise<void> {
  await ApplicationPreparationModel.updateOne(
    { _id: ctx.preparationId, userId: ctx.userId },
    {
      $set: {
        materialsProvenance: {
          provider: provider.name,
          model,
          generatedAt: new Date(),
          profileUpdatedAt: ctx.profileUpdatedAt,
          resumeId: ctx.resumeId,
          resumeVersion: ctx.resumeVersion,
          resumeUpdatedAt: ctx.resumeUpdatedAt,
          jobId: ctx.jobId,
        },
      },
    },
  ).exec();
}

export interface GenerateTailoredResumeResult {
  tailoredResume: {
    summary: string;
    highlights: string[];
    skillsUsed: string[];
    flaggedGaps: string[];
    generatedAt: Date;
    reviewStatus: ComponentReviewStatus;
    verification?: VerificationResult;
  };
  provider: string;
  model: string;
}

export interface GenerateCoverLetterResult {
  coverLetter: {
    body: string;
    flaggedGaps: string[];
    generatedAt: Date;
    reviewStatus: ComponentReviewStatus;
    verification?: VerificationResult;
  };
  provider: string;
  model: string;
}

export interface GenerateAnswersResult {
  answers: Array<{
    question: string;
    answer: string;
    verified: boolean;
    sensitive: boolean;
    source?: string;
    reviewStatus: AnswerReviewStatus;
    generatedAt: Date;
    verification?: VerificationResult;
  }>;
  provider: string;
  model: string;
}

export interface StartPreparationResult {
  preparationId: string;
  status: PreparationStatus;
  job: { id: string; title: string; companyName: string };
  readiness: {
    ready: boolean;
    missingRequiredProfileFields: string[];
    missingRecommendedProfileFields: string[];
    matchedSkills: string[];
    missingSkills: string[];
  };
  missingInformation: string[];
}

/**
 * Start application preparation for a job.
 * Prevents duplicate active preparations for the same candidate+job.
 */
export async function startPreparation(
  userId: Types.ObjectId,
  jobId: string,
  resumeId?: string,
): Promise<StartPreparationResult> {
  // Validate jobId
  if (!Types.ObjectId.isValid(jobId)) {
    throw new NotFoundError('Job', jobId);
  }

  // Check for existing active preparation
  const existing = await preparationRepository.findActiveByUserIdAndJobId(userId, jobId);
  if (existing) {
    return {
      preparationId: existing._id.toString(),
      status: existing.status,
      job: {
        id: existing.jobId.toString(),
        title: existing.jobSnapshot.title,
        companyName: existing.jobSnapshot.companyName,
      },
      readiness: {
        ready: false,
        missingRequiredProfileFields: [],
        missingRecommendedProfileFields: [],
        matchedSkills: [],
        missingSkills: [],
      },
      missingInformation: existing.missingInformation ?? [],
    };
  }

  // Verify job exists
  const job = await jobRepository.findById(jobId);
  if (!job || (job as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', jobId);
  }

  // Verify candidate profile exists
  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }

  // Get job-specific readiness
  const matchableJob: MatchableJob = {
    title: job.title,
    companyName: job.companyName,
    requiredSkills: (job.requiredSkills ?? []).map((s) => ({ name: s.name, required: s.required })),
    preferredSkills: (job.preferredSkills ?? []).map((s) => ({ name: s.name })),
  };
  const matchableProfile: MatchableProfile = {
    skills: (profile.skills ?? []).map((s) => ({ name: s.name })),
    yearsOfExperience: profile.yearsOfExperience,
    currentJobTitle: profile.currentJobTitle,
    headline: profile.headline,
    education: (profile.education ?? []).map((e) => ({
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
    })),
    jobPreferences: profile.jobPreferences ?? undefined,
  };
  computeJobMatch(matchableJob, matchableProfile);
  const readiness = await assessJobReadiness(userId, matchableJob);

  // Build missing information list
  const missingInformation: string[] = [];
  if (!norm(profile.firstName) || !norm(profile.email ?? '')) missingInformation.push('personal');
  if (
    !norm(profile.headline ?? '') ||
    !norm(profile.professionalSummary ?? '') ||
    profile.yearsOfExperience == null
  ) missingInformation.push('professional');
  if (!Array.isArray(profile.skills) || profile.skills.length === 0)
    missingInformation.push('skills');
  if (readiness.missingSkills.length > 0) {
    missingInformation.push(...readiness.missingSkills.map((s) => `skill: ${s}`));
  }

  const resumeObjId = resumeId ? new Types.ObjectId(resumeId) : undefined;
  const preparation = await preparationRepository.create({
    userId,
    jobId: new Types.ObjectId(jobId),
    jobSnapshot: { title: job.title, companyName: job.companyName },
    resumeId: resumeObjId,
    status: 'DRAFT',
    missingInformation,
    answers: [],
  });

  return {
    preparationId: preparation._id.toString(),
    status: preparation.status,
    job: {
      id: jobId,
      title: job.title,
      companyName: job.companyName,
    },
    readiness: {
      ready: readiness.ready,
      missingRequiredProfileFields: readiness.missingRequiredProfileFields,
      missingRecommendedProfileFields: readiness.missingRecommendedProfileFields,
      matchedSkills: readiness.matchedSkills,
      missingSkills: readiness.missingSkills,
    },
    missingInformation,
  };
}

/**
 * Generate a tailored resume for the preparation.
 */
export async function generateTailoredResume(
  userId: Types.ObjectId,
  preparationId: string,
  options: { replace?: boolean } = {},
  provider: AIProvider = getAIProvider(),
): Promise<GenerateTailoredResumeResult> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['DRAFT', 'IN_PROGRESS']);

  const existingTailored = prep.tailoredResume;
  if (existingTailored?.reviewStatus === 'APPROVED' && !options.replace) {
    throw new ConflictError(
      'Tailored resume is already approved; pass replace:true to regenerate',
      { field: 'tailoredResume' },
    );
  }

  const ctx = await gatherContext(userId, prep.jobId.toString(), prep);

  const response = await provider.generateContent({
    kind: 'resumeDraft',
    systemPrompt:
      'You draft tailored resumes from verified candidate facts only. Rules: use only the facts provided; never invent skills, employers, dates, achievements, degrees, certifications, or work authorization. If a fact is missing, say so in flaggedGaps instead of guessing. Respond with a single JSON document matching the requested shape. No prose outside the JSON.',
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

  // Server-side factual grounding: verify AI-generated claims against verified facts.
  const resumeVerification = factVerificationService.verifyTailoredResume(ctx.facts, {
    summary: output.summary,
    highlights: output.highlights,
    skillsUsed,
  });

  const tailoredResume = {
    summary: output.summary,
    highlights: output.highlights,
    skillsUsed,
    flaggedGaps,
    generatedAt: new Date(),
    reviewStatus: 'PENDING' as ComponentReviewStatus,
    verification: resumeVerification,
    provenance: {
      profileUpdatedAt: ctx.profileUpdatedAt,
      resumeId: ctx.resumeId,
      resumeVersion: ctx.resumeVersion,
      resumeUpdatedAt: ctx.resumeUpdatedAt,
      jobId: ctx.jobId,
      generatedAt: new Date(),
    },
  };

  await ApplicationPreparationModel.updateOne(
    { _id: prep._id, userId },
    {
      $set: {
        tailoredResume,
        status: 'IN_PROGRESS',
        materialsProvenance: {
          provider: provider.name,
          model: response.model,
          generatedAt: new Date(),
          profileUpdatedAt: ctx.profileUpdatedAt,
          resumeId: ctx.resumeId,
          resumeVersion: ctx.resumeVersion,
          jobId: ctx.jobId,
        },
      },
    },
  ).exec();
  await recordProvenance(ctx, provider, response.model, `Tailored resume draft generated (${skillsUsed.length} verified skill(s), ${flaggedGaps.length} flagged gap(s))`, 'resume_draft_generated');

  return { tailoredResume: { ...tailoredResume, generatedAt: tailoredResume.generatedAt, verification: resumeVerification }, provider: provider.name, model: response.model };
}

/**
 * Generate a cover letter for the preparation.
 */
export async function generateCoverLetter(
  userId: Types.ObjectId,
  preparationId: string,
  options: { replace?: boolean } = {},
  provider: AIProvider = getAIProvider(),
): Promise<GenerateCoverLetterResult> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['DRAFT', 'IN_PROGRESS']);

  const existingCover = prep.coverLetter;
  if (existingCover?.reviewStatus === 'APPROVED' && !options.replace) {
    throw new ConflictError(
      'Cover letter is already approved; pass replace:true to regenerate',
      { field: 'coverLetter' },
    );
  }

  const ctx = await gatherContext(userId, prep.jobId.toString(), prep);

  const response = await provider.generateContent({
    kind: 'coverLetter',
    systemPrompt:
      'You draft cover letters from verified candidate facts only. Rules: use only the facts provided; never invent company facts, candidate achievements, or experience. Keep writing professional and specific to the job. If a fact is missing, say so in flaggedGaps instead of guessing. Respond with a single JSON document matching the requested shape. No prose outside the JSON.',
    userPrompt: `Write a cover-letter body as JSON {"body": string, "flaggedGaps": string[]}. Facts: ${JSON.stringify(ctx.facts)}`,
    facts: ctx.facts as unknown as Record<string, unknown>,
  });
  const output = parseWith(coverLetterOutputSchema, response.text);
  const flaggedGaps = dedupe([...output.flaggedGaps, ...codeGaps(ctx.facts)]);

  // Server-side factual grounding: verify cover letter claims against verified facts.
  const coverLetterVerification = factVerificationService.verifyCoverLetter(ctx.facts, {
    body: output.body,
  });

  const coverLetter = {
    body: output.body,
    flaggedGaps,
    generatedAt: new Date(),
    reviewStatus: 'PENDING' as ComponentReviewStatus,
    verification: coverLetterVerification,
    provenance: {
      profileUpdatedAt: ctx.profileUpdatedAt,
      resumeId: ctx.resumeId,
      resumeVersion: ctx.resumeVersion,
      resumeUpdatedAt: ctx.resumeUpdatedAt,
      jobId: ctx.jobId,
      generatedAt: new Date(),
    },
  };

  await ApplicationPreparationModel.updateOne(
    { _id: prep._id, userId },
    {
      $set: {
        coverLetter,
        status: 'IN_PROGRESS',
        materialsProvenance: {
          provider: provider.name,
          model: response.model,
          generatedAt: new Date(),
          profileUpdatedAt: ctx.profileUpdatedAt,
          resumeId: ctx.resumeId,
          resumeVersion: ctx.resumeVersion,
          jobId: ctx.jobId,
        },
      },
    },
  ).exec();
  await recordProvenance(ctx, provider, response.model, `Cover letter draft generated (${flaggedGaps.length} flagged gap(s))`, 'cover_letter_generated');

  return { coverLetter: { ...coverLetter, generatedAt: coverLetter.generatedAt, verification: coverLetterVerification }, provider: provider.name, model: response.model };
}

/**
 * Generate answers for application questions.
 */
export async function generateAnswers(
  userId: Types.ObjectId,
  preparationId: string,
  questions: string[],
  provider: AIProvider = getAIProvider(),
): Promise<GenerateAnswersResult> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['DRAFT', 'IN_PROGRESS']);

  const ctx = await gatherContext(userId, prep.jobId.toString(), prep);
  const existingAnswers = [...(prep.answers ?? [])];

  const generatedAnswers: Array<{
    question: string;
    answer: string;
    verified: boolean;
    sensitive: boolean;
    source?: string;
    reviewStatus: AnswerReviewStatus;
    generatedAt: Date;
  }> = [];

  for (const question of questions) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) continue;

    const foundIndex = existingAnswers.findIndex((a) => norm(a.question) === norm(cleanQuestion));
    const relevant = ctx.facts.skills.filter(
      (s) => cleanQuestion.toLowerCase().includes(s) || ctx.facts.requiredSkills.includes(s),
    ).slice(0, 5);

    const isSensitive = SENSITIVE_QUESTION_PATTERN.test(cleanQuestion);
    // Sensitive questions always need candidate input, never auto-answered
    let answerText: string;
    let reviewStatus: AnswerReviewStatus;
    let needsConfirmation: boolean;

    if (isSensitive) {
      answerText = '';
      reviewStatus = 'NEEDS_CANDIDATE_INPUT';
      needsConfirmation = true;
    } else {
      const response = await provider.generateContent({
        kind: 'answer',
        systemPrompt:
          'You answer application questions from verified candidate facts only. Rules: use only the facts provided; never invent values or assume missing details. If information is unsupported, mark needsConfirmation true. Never automatically answer legal declarations, demographic questions, disability questions, criminal-history questions, or other sensitive questions. Respond with a single JSON document matching the requested shape. No prose outside the JSON.',
        userPrompt: `Answer the application question as JSON {"answer": string, "needsConfirmation": boolean}. Question: ${cleanQuestion}. Facts: ${JSON.stringify({ ...ctx.facts, question: cleanQuestion, relevantSkills: relevant })}`,
        facts: { ...ctx.facts, question: cleanQuestion, relevantSkills: relevant } as Record<string, unknown>,
      });
      const output = parseWith(answerOutputSchema, response.text);
      answerText = output.answer;
      needsConfirmation = output.needsConfirmation ?? true;
      reviewStatus = needsConfirmation ? 'NEEDS_REVIEW' : 'GENERATED';
    }

    const entry = {
      _id: new Types.ObjectId(),
      question: cleanQuestion,
      answer: answerText,
      verified: false,
      sensitive: isSensitive,
      source: isSensitive ? undefined : 'verified profile and resume',
      reviewStatus,
      generatedAt: new Date(),
      verification: factVerificationService.verifyAnswer(ctx.facts, cleanQuestion, answerText, isSensitive),
      provenance: {
        profileUpdatedAt: ctx.profileUpdatedAt,
        resumeId: ctx.resumeId,
        resumeVersion: ctx.resumeVersion,
        resumeUpdatedAt: ctx.resumeUpdatedAt,
        jobId: ctx.jobId,
        generatedAt: new Date(),
      },
    };

    if (foundIndex >= 0) {
      existingAnswers[foundIndex] = entry;
    } else {
      existingAnswers.push(entry);
    }
    generatedAnswers.push(entry);
  }

  await ApplicationPreparationModel.updateOne(
    { _id: prep._id, userId },
    { $set: { answers: existingAnswers, status: 'IN_PROGRESS' } },
  ).exec();

  return { answers: generatedAnswers, provider: provider.name, model: '' };
}

/**
 * Edit an individual answer.
 */
export async function updateAnswer(
  userId: Types.ObjectId,
  preparationId: string,
  answerId: string,
  data: {
    answer?: string;
    verified?: boolean;
    reviewStatus?: AnswerReviewStatus;
    reviewerNote?: string;
  },
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW']);

  const answerIndex = prep.answers.findIndex((a) => a._id?.toString() === answerId);
  if (answerIndex < 0) {
    throw new NotFoundError('Answer', answerId);
  }

  const answer = prep.answers[answerIndex];
  const answerChanged = data.answer !== undefined && data.answer !== answer.answer;
  const updatedAnswer = {
    ...answer,
    ...(data.answer !== undefined ? { answer: data.answer } : {}),
    ...(data.verified !== undefined ? { verified: data.verified } : {}),
    ...(data.reviewStatus !== undefined
      ? { reviewStatus: data.reviewStatus, reviewedAt: new Date() }
      : {}),
    ...(data.reviewerNote !== undefined ? { reviewerNote: data.reviewerNote } : {}),
    // Invalidate verification when answer content changes (freshness).
    // The candidate's verified flag is preserved (they may have confirmed
    // the new text), but server-side fact-checking is cleared.
    ...(answerChanged ? { verification: undefined } : {}),
  };
  const updatedAnswers = [...prep.answers];
  updatedAnswers[answerIndex] = updatedAnswer;

  const result = await preparationRepository.update(prep._id, userId, {
    answers: updatedAnswers,
  });
  if (!result) throw new NotFoundError('ApplicationPreparation', preparationId);
  return result;
}

/**
 * Review a component or the whole package.
 */
export async function reviewPreparation(
  userId: Types.ObjectId,
  preparationId: string,
  data: {
    component?: 'tailoredResume' | 'coverLetter' | 'answers' | 'package';
    answerId?: string;
    decision?: 'approve' | 'reject';
    note?: string;
  },
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['IN_PROGRESS', 'READY_FOR_REVIEW']);

  // Freshness check: ensure verification provenance is current before approval.
  // This prevents stale VERIFIED results from authorizing approval of
  // content that was generated against outdated source data.
  if (data.decision === 'approve') {
    const profile = await candidateProfileRepository.findByUserId(userId);
    const currentProfileUpdatedAt = profile?.updatedAt;

    // Fetch current resume from database to check for updates
    let currentResumeUpdatedAt: Date | undefined;
    if (prep.resumeId) {
      const resume = await resumeRepository.findByIdAndUserId(prep.resumeId, userId);
      if (resume) {
        currentResumeUpdatedAt = resume.updatedAt;
      }
    }

    const currentSource = {
      profileUpdatedAt: currentProfileUpdatedAt,
      resumeId: prep.resumeId?.toString(),
      resumeVersion: prep.resumeVersion,
      resumeUpdatedAt: currentResumeUpdatedAt,
    };

    // Check component-level freshness for the specific component being approved.
    // Each component has its own provenance; regenerating one does not
    // freshen others.
    const componentsToCheck: { name: string; provenance: any }[] = [];

    if (data.component === 'tailoredResume' && prep.tailoredResume) {
      componentsToCheck.push({ name: 'tailoredResume', provenance: prep.tailoredResume.provenance });
    } else if (data.component === 'coverLetter' && prep.coverLetter) {
      componentsToCheck.push({ name: 'coverLetter', provenance: prep.coverLetter.provenance });
    } else if (data.component === 'answers') {
      for (const answer of prep.answers) {
        componentsToCheck.push({ name: `answer:${answer._id}`, provenance: answer.provenance });
      }
    } else if (data.component === 'package') {
      // Check all components for package approval
      if (prep.tailoredResume) {
        componentsToCheck.push({ name: 'tailoredResume', provenance: prep.tailoredResume.provenance });
      }
      if (prep.coverLetter) {
        componentsToCheck.push({ name: 'coverLetter', provenance: prep.coverLetter.provenance });
      }
      for (const answer of prep.answers) {
        componentsToCheck.push({ name: `answer:${answer._id}`, provenance: answer.provenance });
      }
    }

    for (const comp of componentsToCheck) {
      const freshness = factVerificationService.checkFreshness(comp.provenance, currentSource);
      if (freshness.status !== 'FRESH') {
        throw new ValidationError(
          `Cannot approve ${comp.name}: verification is ${freshness.status.toLowerCase().replace('_', ' ')} (${freshness.reason ?? 'source data changed'})`,
          { freshness, component: comp.name, status: prep.status },
        );
      }
    }
  }

  // Replace entire subdocuments rather than dot-notation $set updates, which
  // are unreliable for nested Mongoose subdocument schemas.
  const updates: Record<string, unknown> = {};

  if (data.component === 'answers' && data.decision) {
    if (data.answerId) {
      const answerIndex = prep.answers.findIndex((a) => a._id?.toString() === data.answerId);
      if (answerIndex < 0) {
        throw new NotFoundError('Answer', data.answerId);
      }
      const updatedAnswers = [...prep.answers];
      updatedAnswers[answerIndex] = {
        ...updatedAnswers[answerIndex],
        reviewStatus: data.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date(),
        reviewerNote: data.note ?? '',
      };
      updates['answers'] = updatedAnswers;
    } else {
      // Approve/reject all answers at once
      const updatedAnswers = [...prep.answers].map((a) => ({
        ...a,
        reviewStatus: data.decision === 'approve' ? 'APPROVED' : 'REJECTED',
        reviewedAt: new Date(),
        reviewerNote: data.note ?? '',
      }));
      updates['answers'] = updatedAnswers;
    }
  } else if (data.component === 'tailoredResume' && data.decision) {
    if (!prep.tailoredResume) {
      throw new NotFoundError('Tailored resume', preparationId);
    }
    updates['tailoredResume'] = {
      ...prep.tailoredResume,
      reviewStatus: data.decision === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date(),
      reviewerNote: data.note ?? '',
    };
  } else if (data.component === 'coverLetter' && data.decision) {
    if (!prep.coverLetter) {
      throw new NotFoundError('Cover letter', preparationId);
    }
    updates['coverLetter'] = {
      ...prep.coverLetter,
      reviewStatus: data.decision === 'approve' ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date(),
      reviewerNote: data.note ?? '',
    };
  } else if (data.component === 'package' && data.decision) {
    // Final package approval/rejection
    if (prep.status === 'IN_PROGRESS' || prep.status === 'READY_FOR_REVIEW') {
      if (data.decision === 'approve') {
        if (!allComponentsApproved(prep)) {
          throw new ValidationError('Cannot approve: not all components have been reviewed and approved', {
            status: prep.status,
          });
        }

        // Cross-component consistency: no conflicting facts across materials.
        const facts = await buildFactsFromPrep(userId, prep);
        const consistency = factVerificationService.checkCrossComponentConsistency(facts, {
          tailoredResume: prep.tailoredResume
            ? { skillsUsed: prep.tailoredResume.skillsUsed, summary: prep.tailoredResume.summary }
            : undefined,
          coverLetter: prep.coverLetter ? { body: prep.coverLetter.body } : undefined,
          answers: prep.answers,
          jobSnapshot: prep.jobSnapshot,
        });
        if (consistency.status === 'UNSUPPORTED') {
          throw new ValidationError('Cannot approve: cross-component consistency check failed', {
            status: prep.status,
            details: consistency,
          });
        }
      }
      updates['status'] = data.decision === 'approve' ? 'APPROVED' : 'REJECTED';
    } else {
      throw new ValidationError('Package review requires IN_PROGRESS or READY_FOR_REVIEW status', {
        status: prep.status,
      });
    }
  } else {
    throw new ValidationError('Invalid review request: specify component and decision', {
      component: data.component,
      decision: data.decision,
    });
  }

  const result = await preparationRepository.update(prep._id, userId, updates);
  if (!result) throw new NotFoundError('ApplicationPreparation', preparationId);
  return result;
}

/**
 * Save / resume a preparation draft.
 */
export async function savePreparation(
  userId: Types.ObjectId,
  preparationId: string,
  data: { missingInformation?: string[] },
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  requireStatus(prep, ['DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'REJECTED', 'APPROVED']);

  const result = await preparationRepository.update(prep._id, userId, {
    ...(data.missingInformation !== undefined ? { missingInformation: data.missingInformation } : {}),
    status: ['REJECTED', 'APPROVED'].includes(prep.status) ? 'DRAFT' : prep.status,
  });
  if (!result) throw new NotFoundError('ApplicationPreparation', preparationId);
  return result;
}

/**
 * Reopen a rejected or approved preparation for continued editing.
 *
 * Transitions:
 *   REJECTED -> DRAFF
 *   APPROVED -> DRAFF
 *
 * When reopening, component review statuses are reset so the candidate must
 * re-review any modified content before final approval. Review history
 * (reviewedAt, reviewerNote) is preserved for audit purposes.
 */
export async function reopenPreparation(
  userId: Types.ObjectId,
  preparationId: string,
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  if (!['REJECTED', 'APPROVED'].includes(prep.status)) {
    throw new ValidationError(
      `Cannot reopen from ${prep.status} status; only rejected or approved preparations can be reopened`,
      { status: prep.status },
    );
  }

  // Reset component review statuses so the candidate must re-review before
  // final approval. Review history (reviewedAt, reviewerNote) is preserved.
  const updatedAnswers = [...(prep.answers ?? [])].map((a) => ({
    ...a,
    reviewStatus: a.reviewStatus === 'APPROVED' ? 'NEEDS_REVIEW' : a.reviewStatus,
    reviewedAt: a.reviewStatus === 'APPROVED' ? undefined : a.reviewedAt,
    reviewerNote: a.reviewStatus === 'APPROVED' ? undefined : a.reviewerNote,
  }));

  const updatedTailoredResume = prep.tailoredResume
    ? {
        ...prep.tailoredResume,
        reviewStatus: prep.tailoredResume.reviewStatus === 'APPROVED' ? 'PENDING' : prep.tailoredResume.reviewStatus,
        reviewedAt:
          prep.tailoredResume.reviewStatus === 'APPROVED'
            ? undefined
            : prep.tailoredResume.reviewedAt,
        reviewerNote:
          prep.tailoredResume.reviewStatus === 'APPROVED'
            ? undefined
            : prep.tailoredResume.reviewerNote,
      }
    : undefined;

  const updatedCoverLetter = prep.coverLetter
    ? {
        ...prep.coverLetter,
        reviewStatus: prep.coverLetter.reviewStatus === 'APPROVED' ? 'PENDING' : prep.coverLetter.reviewStatus,
        reviewedAt:
          prep.coverLetter.reviewStatus === 'APPROVED'
            ? undefined
            : prep.coverLetter.reviewedAt,
        reviewerNote:
          prep.coverLetter.reviewStatus === 'APPROVED'
            ? undefined
            : prep.coverLetter.reviewerNote,
      }
    : undefined;

  const result = await preparationRepository.update(prep._id, userId, {
    status: 'DRAFT',
    answers: updatedAnswers,
    tailoredResume: updatedTailoredResume,
    coverLetter: updatedCoverLetter,
  });
  if (!result) throw new NotFoundError('ApplicationPreparation', preparationId);
  return result;
}

/**
 * Get preparation details.
 */
export async function getPreparation(
  userId: Types.ObjectId,
  preparationId: string,
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  return preparationRepository.findByIdAndUserIdOrThrow(new Types.ObjectId(preparationId), userId);
}

/**
 * List candidate preparations.
 */
export async function listPreparations(
  userId: Types.ObjectId,
  options: {
    status?: PreparationStatus;
    page?: number;
    pageSize?: number;
    query?: string;
  },
): Promise<{
  preparations: IApplicationPreparation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  return preparationRepository.listByUserId(userId, options);
}

/**
 * Cancel a preparation.
 */
export async function cancelPreparation(
  userId: Types.ObjectId,
  preparationId: string,
): Promise<IApplicationPreparation> {
  if (!Types.ObjectId.isValid(preparationId)) {
    throw new NotFoundError('ApplicationPreparation', preparationId);
  }
  const prep = await preparationRepository.findByIdAndUserIdOrThrow(
    new Types.ObjectId(preparationId),
    userId,
  );
  if (!canTransition(prep.status, 'CANCELLED')) {
    // Already cancelled: idempotent, return current state
    return prep;
  }
  const result = await preparationRepository.delete(prep._id, userId);
  if (!result) throw new NotFoundError('ApplicationPreparation', preparationId);
  return { ...prep, status: 'CANCELLED' } as IApplicationPreparation;
}
