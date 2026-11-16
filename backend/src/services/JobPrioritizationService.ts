/**
 * Job prioritization layer (Phase 8.3.12).
 *
 * Combines existing job match scores with existing job-specific profile
 * readiness assessments to produce an explainable priority classification
 * for each of the candidate's jobs. Prioritization categories are NOT
 * application eligibility decisions and never change match scores.
 *
 * Classification thresholds:
 * - STRONG_MATCH_THRESHOLD (80): match scores at or above this value are
 *   treated as strong matches. The value 80 is already used in the
 *   matching test suite as the boundary for a strong match.
 *
 * Priority order (highest to lowest):
 *   HIGH_PRIORITY > GOOD_MATCH_NEEDS_IMPROVEMENT > PROFILE_INCOMPLETE > LOW_MATCH
 */

import { Types } from 'mongoose';
import { CandidateProfileModel } from '../models/CandidateProfile.js';
import { ICandidateProfile } from '../models/CandidateProfile.js';
import { JobRepository } from '../repositories/JobRepository.js';
import {
  computeJobMatch,
  type MatchableJob,
  type MatchableProfile,
} from './JobMatchingService.js';
import { NotFoundError } from '../utils/errors.js';

const jobRepository = new JobRepository();

/** Match scores at or above this value are treated as strong matches. */
export const STRONG_MATCH_THRESHOLD = 80;

export type PriorityLabel =
  | 'HIGH_PRIORITY'
  | 'GOOD_MATCH_NEEDS_IMPROVEMENT'
  | 'PROFILE_INCOMPLETE'
  | 'LOW_MATCH';

const PRIORITY_ORDER: Record<PriorityLabel, number> = {
  HIGH_PRIORITY: 4,
  GOOD_MATCH_NEEDS_IMPROVEMENT: 3,
  PROFILE_INCOMPLETE: 2,
  LOW_MATCH: 1,
};

export interface JobReadinessAssessment {
  ready: boolean;
  missingRequiredProfileFields: string[];
  missingRecommendedProfileFields: string[];
  matchedSkills: string[];
  missingSkills: string[];
}

export interface PrioritizedJob {
  id: string;
  title: string;
  companyName: string;
  location?: string;
  remoteType?: string;
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  postedAt?: Date;
  status?: string;
  source?: string;
  matchScore: number;
  eligible: boolean;
  priority: PriorityLabel;
  priorityReasons: string[];
  readiness: JobReadinessAssessment;
}

export interface PrioritizedJobsOptions {
  minScore?: number;
  page?: number;
  pageSize?: number;
}

export interface PrioritizedJobsResult {
  jobs: PrioritizedJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Norm helper shared with readiness assessment (case-insensitive compare).
 */
function norm(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Job-specific readiness computed against a pre-fetched profile document.
 * Mirrors ProfileReadinessService.assessJobReadiness but avoids re-fetching
 * the profile for every job (prevents an N+1 query problem in listings).
 * Read-only: does not modify the profile or job.
 */
function computeJobReadiness(
  profile: ICandidateProfile,
  job: MatchableJob,
): JobReadinessAssessment {
  const missingRequiredProfileFields: string[] = [];
  const missingRecommendedProfileFields: string[] = [];

  const profileSkills = new Set(
    (profile.skills ?? []).map((s) => String(s.name ?? '').trim().toLowerCase()).filter(Boolean),
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const s of job.requiredSkills ?? []) {
    const name = String(s.name ?? '').trim();
    if (!name) continue;
    if (profileSkills.has(name.toLowerCase())) matchedSkills.push(name);
    else missingSkills.push(name);
  }

  if (!norm(profile.firstName) || !norm(profile.email))
    missingRequiredProfileFields.push('personal');
  if (
    !norm(profile.headline) ||
    !norm(profile.professionalSummary) ||
    profile.yearsOfExperience == null
  )
    missingRequiredProfileFields.push('professional');
  if (!Array.isArray(profile.skills) || profile.skills.length === 0)
    missingRequiredProfileFields.push('skills');
  if (!Array.isArray(profile.experience) || profile.experience.length === 0)
    missingRecommendedProfileFields.push('experience');
  if (!Array.isArray(profile.education) || profile.education.length === 0)
    missingRecommendedProfileFields.push('education');

  return {
    ready: missingRequiredProfileFields.length === 0 && missingSkills.length === 0,
    missingRequiredProfileFields,
    missingRecommendedProfileFields,
    matchedSkills,
    missingSkills,
  };
}

/**
 * Classify a job into a priority label with explainable reasons.
 * Pure function: same inputs always produce the same output.
 */
function classifyPriority(
  matchScore: number,
  eligible: boolean,
  readiness: JobReadinessAssessment,
): { priority: PriorityLabel; reasons: string[] } {
  const reasons: string[] = [];
  let priority: PriorityLabel;

  if (matchScore >= STRONG_MATCH_THRESHOLD) {
    if (readiness.ready) {
      priority = 'HIGH_PRIORITY';
      reasons.push('Strong existing job match');
      reasons.push('Profile readiness requirements satisfied');
    } else {
      priority = 'GOOD_MATCH_NEEDS_IMPROVEMENT';
      reasons.push('Strong existing job match');
      if (readiness.missingRequiredProfileFields.length > 0) {
        reasons.push(
          'Missing required profile information: ' +
            readiness.missingRequiredProfileFields.join(', '),
        );
      }
      if (readiness.missingSkills.length > 0) {
        reasons.push(
          'Missing required job skills: ' + readiness.missingSkills.join(', '),
        );
      }
      if (
        readiness.missingRequiredProfileFields.length === 0 &&
        readiness.missingSkills.length === 0 &&
        readiness.missingRecommendedProfileFields.length > 0
      ) {
        reasons.push(
          'Recommended profile information can be strengthened: ' +
            readiness.missingRecommendedProfileFields.join(', '),
        );
      }
    }
  } else {
    if (readiness.missingRequiredProfileFields.length > 0) {
      priority = 'PROFILE_INCOMPLETE';
      reasons.push('Match below strong threshold');
      reasons.push(
        'Missing required profile information: ' +
          readiness.missingRequiredProfileFields.join(', '),
      );
    } else {
      priority = 'LOW_MATCH';
      reasons.push('Match below strong threshold');
      if (readiness.missingSkills.length > 0) {
        reasons.push(
          'Missing required job skills: ' + readiness.missingSkills.join(', '),
        );
      }
      if (
        readiness.missingRequiredProfileFields.length === 0 &&
        readiness.missingSkills.length === 0 &&
        readiness.missingRecommendedProfileFields.length > 0
      ) {
        reasons.push(
          'Recommended profile information can be strengthened: ' +
            readiness.missingRecommendedProfileFields.join(', '),
        );
      }
    }
  }

  if (!eligible) {
    reasons.push('Not eligible (excluded company or employment type)');
  }

  return { priority, reasons };
}

function mapJobToPrioritizedItem(
  doc: Record<string, unknown>,
  match: ReturnType<typeof computeJobMatch>,
  readiness: JobReadinessAssessment,
): PrioritizedJob {
  const { priority, reasons } = classifyPriority(
    match.score,
    match.eligible,
    readiness,
  );
  return {
    id: (doc as { _id: { toString(): string } })._id.toString(),
    title: (doc as { title: string }).title,
    companyName: (doc as { companyName: string }).companyName,
    location: (doc as { location?: string }).location,
    remoteType: (doc as { remoteType?: string }).remoteType,
    employmentType: (doc as { employmentType?: string }).employmentType,
    experienceLevel: (doc as { experienceLevel?: string }).experienceLevel,
    salaryMin: (doc as { salaryMin?: number }).salaryMin,
    salaryMax: (doc as { salaryMax?: number }).salaryMax,
    salaryCurrency: (doc as { salaryCurrency?: string }).salaryCurrency,
    salaryPeriod: (doc as { salaryPeriod?: string }).salaryPeriod,
    postedAt: (doc as { postedAt?: Date }).postedAt,
    status: (doc as { status?: string }).status,
    source: (doc as { sources?: Array<{ name: string }> }).sources?.[0]?.name,
    matchScore: match.score,
    eligible: match.eligible,
    priority,
    priorityReasons: reasons,
    readiness,
  };
}

/**
 * Prioritize the caller's jobs by combining existing match scores with
 * existing job-specific readiness assessments.
 *
 * Read-only: does not modify jobs, profiles, applications, or reservations.
 * Fetches the candidate profile once to avoid an N+1 query problem when
 * assessing readiness for multiple jobs.
 */
export async function prioritizeJobsForUser(
  userId: Types.ObjectId,
  options: PrioritizedJobsOptions = {},
): Promise<PrioritizedJobsResult> {
  const minScore = options.minScore ?? 0;
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;

  const profile = await CandidateProfileModel.findOne({ userId }).lean<ICandidateProfile>().exec();
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }

  const collected = await jobRepository.findAll(userId, {
    page: 1,
    pageSize: 1000,
    status: 'active',
  });

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

  const assessed = (collected.jobs as unknown as Record<string, unknown>[]).map((doc) => {
    const job: MatchableJob = {
      title: (doc as { title: string }).title,
      companyName: (doc as { companyName: string }).companyName,
      location: (doc as { location?: string }).location,
      city: (doc as { city?: string }).city,
      state: (doc as { state?: string }).state,
      country: (doc as { country?: string }).country,
      remoteType: (doc as { remoteType?: string }).remoteType,
      employmentType: (doc as { employmentType?: string }).employmentType,
      experienceLevel: (doc as { experienceLevel?: string }).experienceLevel,
      description: (doc as { description?: string }).description,
      requirements: (doc as { requirements?: string[] }).requirements,
      requiredSkills: (doc as { requiredSkills?: Array<{ name: string; required?: boolean }> })
        .requiredSkills,
      preferredSkills: (doc as { preferredSkills?: Array<{ name: string }> }).preferredSkills,
      salaryMin: (doc as { salaryMin?: number }).salaryMin,
      salaryMax: (doc as { salaryMax?: number }).salaryMax,
      salaryCurrency: (doc as { salaryCurrency?: string }).salaryCurrency,
      salaryPeriod: (doc as { salaryPeriod?: string }).salaryPeriod,
      status: (doc as { status?: string }).status,
    };
    const match = computeJobMatch(job, matchableProfile);
    const readiness = computeJobReadiness(profile, job);
    return mapJobToPrioritizedItem(doc, match, readiness);
  });

  const filtered = assessed
    .filter((entry) => entry.matchScore >= minScore)
    .sort((a, b) => {
      const orderDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (orderDiff !== 0) return orderDiff;
      return b.matchScore - a.matchScore;
    });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pageEntries = filtered.slice(start, start + pageSize);

  return {
    jobs: pageEntries,
    total,
    page,
    pageSize,
    totalPages,
  };
}
