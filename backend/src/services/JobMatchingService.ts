/**
 * Deterministic job-matching service (Phase 5).
 *
 * Compares a normalized job posting against the candidate's verified profile
 * and job preferences. No AI provider is involved: every factor is a pure,
 * documented computation over stored data.
 *
 * ---- Weight allocation (sums to 100) ----
 * skills         35  (required skills 25 + preferred skills 10)
 * experience     20  (candidate years vs. minimum years implied by job level)
 * title/role     15  (token overlap: job title vs. desired roles + current title + headline)
 * location/mode  15  (remoteType vs. preferred work modes; place vs. preferred locations/countries)
 * salary          5  (range overlap, same currency + period only)
 * employmentType  5  (job type listed in preferred employment types)
 * education       5  (explicit degree/certification requirements only)
 *
 * ---- Missing information policy ----
 * Unknown is never treated as a match or a mismatch. A factor whose inputs
 * are absent on either side is NOT EVALUABLE: it contributes neither points
 * nor weight (its weight is excluded from the denominator) and the reason is
 * recorded in `missingData`. Consequences:
 * - Sparse jobs/profiles cannot inflate their score through missing factors.
 * - The score is conditional on the evaluated factors; `evaluatedWeight` and
 *   `missingData` always accompany it so callers can see the coverage.
 * - When nothing is evaluable, the score is 0 with an "insufficient data" note.
 * - An empty candidate array (e.g. no recorded skills) is treated as unknown,
 *   not as evidence of absence: absence of entered data is not evidence of
 *   absence of the qualification.
 *
 * ---- Hard eligibility (separate from the score) ----
 * `eligible` is false when the job's company is on the candidate's excluded
 * list or the job's employment type is an excluded type. Eligibility never
 * changes the numeric score; both are returned together.
 *
 * The score is a fit indicator for ranking and filtering. It is NOT a
 * probability of receiving an interview.
 */

import { Types } from 'mongoose';
import { CandidateProfileRepository } from '../repositories/CandidateProfileRepository.js';
import { JobRepository } from '../repositories/JobRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { getJobById, type JobDetail } from './JobService.js';

const candidateProfileRepository = new CandidateProfileRepository();
const jobRepository = new JobRepository();

/** Maximum jobs scored per ranked-listing request (bounded full scan). */
export const MATCH_SCAN_LIMIT = 200;

/** Minimum years of experience typically implied by a job experience level. */
const LEVEL_MIN_YEARS: Record<string, number> = {
  internship: 0,
  entry: 0,
  junior: 1,
  mid: 3,
  senior: 5,
  lead: 8,
};

/** Degree keyword groups ordered by ascending level. */
const DEGREE_LEVELS: Array<{ level: number; label: string; pattern: RegExp }> = [
  { level: 2, label: 'associate', pattern: /\bassociate'?s?(\s+degree)?\b|\bA\.?S\.?\b|\bA\.?A\.?\b/i },
  { level: 3, label: 'bachelor', pattern: /\bbachelor'?s?(\s+degree)?\b|\bB\.?S\.?\b|\bB\.?A\.?\b/i },
  { level: 4, label: 'master', pattern: /\bmaster'?s?(\s+degree)?\b|\bM\.?S\.?\b|\bM\.?A\.?\b|\bMBA\b/i },
  { level: 5, label: 'doctorate', pattern: /\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i },
];

export interface MatchWeights {
  skillsRequired: number;
  skillsPreferred: number;
  experience: number;
  title: number;
  location: number;
  salary: number;
  employmentType: number;
  education: number;
}

export const DEFAULT_MATCH_WEIGHTS: MatchWeights = {
  skillsRequired: 25,
  skillsPreferred: 10,
  experience: 20,
  title: 15,
  location: 15,
  salary: 5,
  employmentType: 5,
  education: 5,
};

/** Minimal structural input: anything shaped like a normalized/stored job. */
export interface MatchableJob {
  title: string;
  companyName: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType?: string;
  employmentType?: string;
  experienceLevel?: string;
  description?: string;
  requirements?: string[];
  requiredSkills?: Array<{ name: string; required?: boolean }>;
  preferredSkills?: Array<{ name: string }>;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  status?: string;
}

/** Minimal structural input: anything shaped like a stored candidate profile. */
export interface MatchableProfile {
  skills?: Array<{ name: string }>;
  yearsOfExperience?: number;
  currentJobTitle?: string;
  headline?: string;
  education?: Array<{ degree?: string; fieldOfStudy?: string }>;
  certifications?: Array<{ name: string }>;
  jobPreferences?: {
    desiredRoles?: string[];
    preferredLocations?: string[];
    preferredCountries?: string[];
    workMode?: string[];
    employmentTypes?: string[];
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
    excludedCompanies?: string[];
    excludedJobTypes?: string[];
  } | null;
}

export interface MatchFactorResult {
  key: string;
  label: string;
  weight: number;
  evaluable: boolean;
  /** 0-100 when evaluable, null otherwise. */
  score: number | null;
  /** Weight actually counted toward the denominator (0 when not evaluable). */
  countedWeight: number;
  detail: string;
  matched: string[];
  mismatched: string[];
}

export interface JobMatchResult {
  /** Integer 0-100 fit indicator (not an interview probability). */
  score: number;
  eligible: boolean;
  eligibilityReasons: string[];
  factors: MatchFactorResult[];
  missingData: string[];
  /** Sum of weights of evaluable factors (max 100). */
  evaluatedWeight: number;
}

export interface MatchedJobItem {
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
}

function norm(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function skillNames(skills: Array<{ name: string }> | undefined): string[] {
  return (skills ?? []).map((s) => norm(s.name)).filter(Boolean);
}

function highestDegreeLevel(entries: Array<{ degree?: string; fieldOfStudy?: string }>): { level: number; label: string | null } {
  let best = { level: 0, label: null as string | null };
  for (const entry of entries ?? []) {
    const text = `${entry.degree ?? ''} ${entry.fieldOfStudy ?? ''}`;
    for (const degree of DEGREE_LEVELS) {
      if (degree.level > best.level && degree.pattern.test(text)) {
        best = { level: degree.level, label: degree.label };
      }
    }
  }
  return best;
}

/**
 * Pure deterministic matcher. Same inputs (and weights) always produce the
 * same output; it performs no I/O and invents no qualifications.
 */
export function computeJobMatch(
  job: MatchableJob,
  profile: MatchableProfile,
  weights: MatchWeights = DEFAULT_MATCH_WEIGHTS,
): JobMatchResult {
  const factors: MatchFactorResult[] = [];
  const missingData: string[] = [];
  const prefs = profile.jobPreferences ?? null;

  // ---- 1. Required skills ----
  const requiredPool = job.requiredSkills ?? [];
  const flaggedRequired = requiredPool.filter((s) => s.required === true).map((s) => norm(s.name)).filter(Boolean);
  // The requiredSkills array semantically lists what the job asks for; when
  // nothing is explicitly flagged required, treat the whole array as required.
  const requiredSet = flaggedRequired.length > 0
    ? flaggedRequired
    : requiredPool.map((s) => norm(s.name)).filter(Boolean);
  const candidateSkills = skillNames(profile.skills);
  if (requiredSet.length > 0 && candidateSkills.length > 0) {
    const matched = requiredSet.filter((s) => candidateSkills.includes(s));
    const mismatched = requiredSet.filter((s) => !candidateSkills.includes(s));
    const score = Math.round((100 * matched.length) / requiredSet.length);
    factors.push({
      key: 'skillsRequired', label: 'Required skills', weight: weights.skillsRequired,
      evaluable: true, score, countedWeight: weights.skillsRequired,
      detail: `${matched.length} of ${requiredSet.length} required skills verified in profile`,
      matched, mismatched,
    });
  } else {
    factors.push({
      key: 'skillsRequired', label: 'Required skills', weight: weights.skillsRequired,
      evaluable: false, score: null, countedWeight: 0,
      detail: requiredSet.length === 0 ? 'Job lists no required skills' : 'Profile records no skills; cannot assess skill fit',
      matched: [], mismatched: [],
    });
    missingData.push(requiredSet.length === 0 ? 'job required skills unknown' : 'candidate skills unknown');
  }

  // ---- 2. Preferred skills ----
  const preferredSet = (job.preferredSkills ?? []).map((s) => norm(s.name)).filter(Boolean);
  if (preferredSet.length > 0 && candidateSkills.length > 0) {
    const matched = preferredSet.filter((s) => candidateSkills.includes(s));
    const score = Math.round((100 * matched.length) / preferredSet.length);
    factors.push({
      key: 'skillsPreferred', label: 'Preferred skills', weight: weights.skillsPreferred,
      evaluable: true, score, countedWeight: weights.skillsPreferred,
      detail: `${matched.length} of ${preferredSet.length} preferred skills verified in profile`,
      matched, mismatched: [],
    });
  } else {
    factors.push({
      key: 'skillsPreferred', label: 'Preferred skills', weight: weights.skillsPreferred,
      evaluable: false, score: null, countedWeight: 0,
      detail: preferredSet.length === 0 ? 'Job lists no preferred skills' : 'Profile records no skills; cannot assess skill fit',
      matched: [], mismatched: [],
    });
    if (preferredSet.length > 0) missingData.push('candidate skills unknown');
  }

  // ---- 3. Experience ----
  const minYears = job.experienceLevel ? LEVEL_MIN_YEARS[norm(job.experienceLevel)] : undefined;
  if (minYears !== undefined && profile.yearsOfExperience != null) {
    const years = profile.yearsOfExperience;
    const score = minYears <= 0 ? 100 : years >= minYears ? 100 : Math.round((100 * years) / minYears);
    factors.push({
      key: 'experience', label: 'Experience', weight: weights.experience,
      evaluable: true, score, countedWeight: weights.experience,
      detail: `Candidate has ${years} year(s) of experience; this level typically expects ${minYears}+`,
      matched: years >= minYears ? [`${years} years meets ${minYears}+ year expectation`] : [],
      mismatched: years >= minYears ? [] : [`${years} years below ${minYears}+ year expectation`],
    });
  } else {
    factors.push({
      key: 'experience', label: 'Experience', weight: weights.experience,
      evaluable: false, score: null, countedWeight: 0,
      detail: minYears === undefined ? 'Job experience level unknown' : 'Candidate years of experience unknown',
      matched: [], mismatched: [],
    });
    missingData.push(minYears === undefined ? 'job experience level unknown' : 'candidate experience unknown');
  }

  // ---- 4. Title / role ----
  const jobTokens = [...new Set(tokenize(job.title ?? ''))];
  const roleText = [
    ...(prefs?.desiredRoles ?? []),
    profile.currentJobTitle ?? '',
    profile.headline ?? '',
  ].join(' ');
  const roleTokens = new Set(tokenize(roleText));
  if (jobTokens.length > 0 && roleTokens.size > 0) {
    const overlap = jobTokens.filter((t) => roleTokens.has(t));
    const score = Math.round((100 * overlap.length) / jobTokens.length);
    factors.push({
      key: 'title', label: 'Role alignment', weight: weights.title,
      evaluable: true, score, countedWeight: weights.title,
      detail: overlap.length > 0 ? `Title shares ${overlap.length} term(s) with target roles` : 'Title shares no terms with target roles',
      matched: overlap, mismatched: [],
    });
  } else {
    factors.push({
      key: 'title', label: 'Role alignment', weight: weights.title,
      evaluable: false, score: null, countedWeight: 0,
      detail: 'No desired roles, current title, or headline recorded',
      matched: [], mismatched: [],
    });
    missingData.push('candidate target roles unknown');
  }

  // ---- 5. Location / work mode ----
  const modeParts: string[] = [];
  let modeScoreSum = 0;
  let modeWeightCount = 0;
  const matchedPlace: string[] = [];
  const mismatchedPlace: string[] = [];
  const jobMode = norm(job.remoteType);
  const prefModes = (prefs?.workMode ?? []).map(norm);
  if (jobMode && jobMode !== 'unknown' && prefModes.length > 0) {
    const modeMatch = prefModes.includes(jobMode) || prefModes.includes('flexible') || jobMode === 'flexible';
    modeScoreSum += modeMatch ? 100 : 0;
    modeWeightCount += 1;
    modeParts.push(modeMatch ? `work mode '${job.remoteType}' accepted` : `work mode '${job.remoteType}' not in preferences`);
    if (!modeMatch) mismatchedPlace.push(`work mode ${job.remoteType}`);
  } else {
    modeParts.push('work mode not assessable');
  }
  const jobPlace = [job.location, job.city, job.state, job.country].filter(Boolean).join(' | ');
  const prefPlaces = [...(prefs?.preferredLocations ?? []), ...(prefs?.preferredCountries ?? [])].map(norm).filter(Boolean);
  if (jobMode !== 'remote' && jobPlace && prefPlaces.length > 0) {
    const placeLower = jobPlace.toLowerCase();
    const placeMatch = prefPlaces.some((p) => placeLower.includes(p) || p.includes(placeLower));
    modeScoreSum += placeMatch ? 100 : 0;
    modeWeightCount += 1;
    modeParts.push(placeMatch ? 'location matches preferences' : 'location does not match preferences');
    if (placeMatch) matchedPlace.push(jobPlace);
    else mismatchedPlace.push(jobPlace);
  }
  if (modeWeightCount > 0) {
    const score = Math.round(modeScoreSum / modeWeightCount);
    factors.push({
      key: 'location', label: 'Location & work mode', weight: weights.location,
      evaluable: true, score, countedWeight: weights.location,
      detail: modeParts.join('; '), matched: matchedPlace, mismatched: mismatchedPlace,
    });
  } else {
    factors.push({
      key: 'location', label: 'Location & work mode', weight: weights.location,
      evaluable: false, score: null, countedWeight: 0,
      detail: 'Job location/mode or candidate preferences unknown',
      matched: [], mismatched: [],
    });
    missingData.push('location or work-mode preferences unknown');
  }

  // ---- 6. Salary ----
  const sameCurrency = job.salaryCurrency && prefs?.salaryCurrency
    && norm(job.salaryCurrency) === norm(prefs.salaryCurrency);
  const samePeriod = job.salaryPeriod && prefs?.salaryPeriod && norm(job.salaryPeriod) === norm(prefs.salaryPeriod);
  const jobHasRange = job.salaryMin != null || job.salaryMax != null;
  const prefHasRange = prefs != null && (prefs.salaryMin != null || prefs.salaryMax != null);
  if (jobHasRange && prefHasRange && sameCurrency && samePeriod) {
    const jobMin = job.salaryMin ?? Number.NEGATIVE_INFINITY;
    const jobMax = job.salaryMax ?? Number.POSITIVE_INFINITY;
    const prefMin = prefs!.salaryMin ?? Number.NEGATIVE_INFINITY;
    const prefMax = prefs!.salaryMax ?? Number.POSITIVE_INFINITY;
    const overlap = jobMin <= prefMax && prefMin <= jobMax;
    factors.push({
      key: 'salary', label: 'Salary', weight: weights.salary,
      evaluable: true, score: overlap ? 100 : 0, countedWeight: weights.salary,
      detail: overlap ? 'Salary ranges overlap' : 'Salary ranges do not overlap',
      matched: overlap ? ['salary ranges overlap'] : [],
      mismatched: overlap ? [] : ['salary ranges do not overlap'],
    });
  } else {
    factors.push({
      key: 'salary', label: 'Salary', weight: weights.salary,
      evaluable: false, score: null, countedWeight: 0,
      detail: 'Salary unknown on one side, or currency/period differs',
      matched: [], mismatched: [],
    });
    missingData.push('salary expectations unknown or incomparable');
  }

  // ---- 7. Employment type ----
  const jobType = norm(job.employmentType);
  const prefTypes = (prefs?.employmentTypes ?? []).map(norm);
  if (jobType && jobType !== 'unknown' && prefTypes.length > 0) {
    const typeMatch = prefTypes.includes(jobType);
    factors.push({
      key: 'employmentType', label: 'Employment type', weight: weights.employmentType,
      evaluable: true, score: typeMatch ? 100 : 0, countedWeight: weights.employmentType,
      detail: typeMatch ? `Employment type '${job.employmentType}' preferred` : `Employment type '${job.employmentType}' not in preferences`,
      matched: typeMatch ? [job.employmentType as string] : [],
      mismatched: typeMatch ? [] : [job.employmentType as string],
    });
  } else {
    factors.push({
      key: 'employmentType', label: 'Employment type', weight: weights.employmentType,
      evaluable: false, score: null, countedWeight: 0,
      detail: 'Job employment type or candidate preferences unknown',
      matched: [], mismatched: [],
    });
    missingData.push('employment type preferences unknown');
  }

  // ---- 8. Education (explicit requirements only) ----
  const reqText = [...(job.requirements ?? []), job.description ?? ''].join('\n');
  const degreeMentioned = DEGREE_LEVELS.some((d) => d.pattern.test(reqText));
  const requireWord = /(requir|must have|mandatory|minimum|need)/i.test(reqText);
  const certMentioned = /(certificat|certified|licens)/i.test(reqText);
  const eduParts: string[] = [];
  let eduScoreSum = 0;
  let eduCount = 0;
  const eduMismatched: string[] = [];
  const eduMatched: string[] = [];
  const profileEducation = profile.education ?? [];
  if (degreeMentioned && requireWord) {
    let requiredLevel = 0;
    let requiredLabel = '';
    for (const degree of DEGREE_LEVELS) {
      if (degree.pattern.test(reqText) && degree.level >= requiredLevel) {
        requiredLevel = degree.level;
        requiredLabel = degree.label;
      }
    }
    if (profileEducation.length > 0) {
      const candidate = highestDegreeLevel(profileEducation);
      const degreeMatch = candidate.level >= requiredLevel;
      eduScoreSum += degreeMatch ? 100 : 0;
      eduCount += 1;
      eduParts.push(degreeMatch
        ? `profile ${candidate.label ?? 'education'} meets ${requiredLabel} requirement`
        : `profile education below ${requiredLabel} requirement`);
      if (degreeMatch && candidate.label) eduMatched.push(candidate.label);
      else eduMismatched.push(`${requiredLabel} required`);
    } else {
      eduParts.push('degree required but profile records no education');
    }
  }
  if (certMentioned && requireWord) {
    const profileCerts = profile.certifications ?? [];
    if (profileCerts.length > 0) {
      const certHit = profileCerts.some((c) => c.name && reqText.toLowerCase().includes(norm(c.name)));
      eduScoreSum += certHit ? 100 : 0;
      eduCount += 1;
      eduParts.push(certHit ? 'a recorded certification is named in the requirements' : 'no recorded certification is named in the requirements');
      if (!certHit) eduMismatched.push('required certification not verified');
    } else {
      eduParts.push('certification required but profile records none');
    }
  }
  if (eduCount > 0) {
    factors.push({
      key: 'education', label: 'Education & credentials', weight: weights.education,
      evaluable: true, score: Math.round(eduScoreSum / eduCount), countedWeight: weights.education,
      detail: eduParts.join('; '), matched: eduMatched, mismatched: eduMismatched,
    });
  } else {
    factors.push({
      key: 'education', label: 'Education & credentials', weight: weights.education,
      evaluable: false, score: null, countedWeight: 0,
      detail: degreeMentioned || certMentioned
        ? 'Requirements mention credentials but profile has no comparable records'
        : 'No explicit degree or certification requirement found',
      matched: [], mismatched: [],
    });
    missingData.push('explicit education requirements unknown or unverifiable');
  }

  // ---- Hard eligibility (separate from the score) ----
  const eligibilityReasons: string[] = [];
  const companyLower = norm(job.companyName);
  const excludedHit = (prefs?.excludedCompanies ?? [])
    .map(norm)
    .filter(Boolean)
    .find((ex) => companyLower === ex || companyLower.includes(ex));
  if (excludedHit) {
    eligibilityReasons.push(`Company '${job.companyName}' is on your excluded list`);
  }
  if (jobType && jobType !== 'unknown' && (prefs?.excludedJobTypes ?? []).map(norm).includes(jobType)) {
    eligibilityReasons.push(`Employment type '${job.employmentType}' is excluded in preferences`);
  }

  // ---- Aggregate over evaluable factors only ----
  const evaluatedWeight = factors.reduce((sum, f) => sum + f.countedWeight, 0);
  let score: number;
  const finalMissing = [...missingData];
  if (evaluatedWeight <= 0) {
    score = 0;
    finalMissing.push('insufficient data to score this job');
  } else {
    const weighted = factors.reduce((sum, f) => sum + (f.score ?? 0) * f.countedWeight, 0);
    score = Math.max(0, Math.min(100, Math.round(weighted / evaluatedWeight)));
  }

  return {
    score,
    eligible: eligibilityReasons.length === 0,
    eligibilityReasons,
    factors,
    missingData: [...new Set(finalMissing)],
    evaluatedWeight,
  };
}

/**
 * Match a single owned job against the authenticated candidate's profile.
 * Jobs are scoped to the caller (consistent with listing isolation);
 * soft-deleted jobs behave as not found.
 */
export async function matchJobForUser(
  userId: Types.ObjectId,
  jobId: string,
): Promise<{ job: JobDetail; match: JobMatchResult }> {
  const owned = await jobRepository.findByIdAndUserId(jobId, userId);
  if (!owned || (owned as { status?: string }).status === 'deleted') {
    throw new NotFoundError('Job', jobId);
  }
  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  const job = await getJobById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  return { job, match: computeJobMatch(job, profile) };
}

export interface ListMatchesOptions {
  minScore?: number;
  page?: number;
  pageSize?: number;
}

export interface ListMatchesResult {
  matches: MatchedJobItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  scanned: number;
}

/**
 * Rank the caller's jobs by match score. Scores every owned, non-deleted job
 * up to MATCH_SCAN_LIMIT (bounded scan), filters by minScore, sorts by score
 * descending, then paginates. Requires a profile; without one there is
 * nothing truthful to match against.
 */
export async function listJobMatchesForUser(
  userId: Types.ObjectId,
  options: ListMatchesOptions = {},
): Promise<ListMatchesResult> {
  const minScore = options.minScore ?? 0;
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;

  const profile = await candidateProfileRepository.findByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }

  const collected: Array<{ doc: Record<string, unknown>; match: JobMatchResult }> = [];
  let scanPage = 1;
  const scanSize = 100;
  while (collected.length + scanSize <= MATCH_SCAN_LIMIT + scanSize) {
    const result = await jobRepository.findAll(userId, { page: scanPage, pageSize: scanSize });
    if (result.jobs.length === 0) break;
    for (const doc of result.jobs as unknown as Record<string, unknown>[]) {
      if (collected.length >= MATCH_SCAN_LIMIT) break;
      collected.push({ doc, match: computeJobMatch(doc as unknown as MatchableJob, profile) });
    }
    if (collected.length >= MATCH_SCAN_LIMIT) break;
    if (scanPage * scanSize >= result.total) break;
    scanPage += 1;
  }

  const filtered = collected
    .filter((entry) => entry.match.score >= minScore)
    .sort((a, b) => b.match.score - a.match.score);

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pageEntries = filtered.slice(start, start + pageSize);

  const matches: MatchedJobItem[] = pageEntries.map((entry) => {
    const doc = entry.doc as unknown as {
      _id: { toString(): string };
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
      sources?: Array<{ name: string }>;
    };
    return {
      id: doc._id.toString(),
      title: doc.title,
      companyName: doc.companyName,
      location: doc.location,
      remoteType: doc.remoteType,
      employmentType: doc.employmentType,
      experienceLevel: doc.experienceLevel,
      salaryMin: doc.salaryMin,
      salaryMax: doc.salaryMax,
      salaryCurrency: doc.salaryCurrency,
      salaryPeriod: doc.salaryPeriod,
      postedAt: doc.postedAt,
      status: doc.status,
      source: doc.sources?.[0]?.name,
      matchScore: entry.match.score,
      eligible: entry.match.eligible,
    };
  });

  return { matches, total, page, pageSize, totalPages, scanned: collected.length };
}
