/**
 * Profile readiness assessment (Phase 8.3.8).
 *
 * Deterministic, read-only assessment of a candidate's profile completeness
 * and application readiness. It is intentionally separate from job matching
 * eligibility and matching score: a complete profile does not imply a match,
 * and an incomplete profile does not imply ineligibility for a specific job.
 *
 * Resume availability is included because many applications require a resume
 * file, but resume presence is treated as recommended (not required) so a
 * profile without one is not penalized into ineligibility.
 */

import { Types } from 'mongoose';
import { CandidateProfileModel, ICandidateProfile } from '../models/CandidateProfile.js';
import { ResumeModel, IResume } from '../models/Resume.js';

export type ReadinessStatus = 'ready' | 'needs_work' | 'incomplete' | 'no_profile';

export interface FieldDetail {
  completed: boolean;
  missing: string[];
}

export interface ProfileReadinessResult {
  userId: string;
  status: ReadinessStatus;
  percentage: number;
  completedSections: string[];
  incompleteSections: string[];
  details: Record<string, FieldDetail>;
  resumeAvailable: boolean;
  resumeId?: string;
  missingRequired: string[];
  missingRecommended: string[];
  optional: string[];
  recommendations: string[];
}

function norm(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function hasItems(value: unknown[] | undefined | null): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** Required fields: absence materially blocks applying. */
const REQUIRED_SECTIONS: Array<{
  key: string;
  label: string;
  check: (p: ICandidateProfile) => boolean;
  missing: (p: ICandidateProfile) => string[];
}> = [
  {
    key: 'personal',
    label: 'Personal information',
    check: (p) => Boolean(norm(p.firstName) && norm(p.lastName) && norm(p.email) && norm(p.phone)),
    missing: (p) => [
      !norm(p.firstName) && 'firstName',
      !norm(p.lastName) && 'lastName',
      !norm(p.email) && 'email',
      !norm(p.phone) && 'phone',
    ].filter(Boolean) as string[],
  },
  {
    key: 'professional',
    label: 'Professional summary',
    check: (p) => Boolean(norm(p.headline) && norm(p.professionalSummary) && p.yearsOfExperience != null),
    missing: (p) => [
      !norm(p.headline) && 'headline',
      !norm(p.professionalSummary) && 'professionalSummary',
      p.yearsOfExperience == null && 'yearsOfExperience',
    ].filter(Boolean) as string[],
  },
  {
    key: 'skills',
    label: 'Skills',
    check: (p) => hasItems(p.skills),
    missing: (p) => (hasItems(p.skills) ? [] : ['skills']),
  },
];

/** Recommended fields: strengthen an application but are not required. */
const RECOMMENDED_SECTIONS: Array<{
  key: string;
  label: string;
  check: (p: ICandidateProfile) => boolean;
  missing: (p: ICandidateProfile) => string[];
}> = [
  {
    key: 'experience',
    label: 'Work experience',
    check: (p) => hasItems(p.experience),
    missing: (p) => (hasItems(p.experience) ? [] : ['experience']),
  },
  {
    key: 'education',
    label: 'Education',
    check: (p) => hasItems(p.education),
    missing: (p) => (hasItems(p.education) ? [] : ['education']),
  },
  {
    key: 'preferences',
    label: 'Job preferences',
    check: (p) => {
      const prefs = p.jobPreferences;
      return Boolean(
        hasItems(prefs?.desiredRoles) ||
          hasItems(prefs?.preferredLocations) ||
          hasItems(prefs?.workMode),
      );
    },
    missing: (p) => {
      const prefs = p.jobPreferences;
      const missing: string[] = [];
      if (!hasItems(prefs?.desiredRoles)) missing.push('desiredRoles');
      if (!hasItems(prefs?.preferredLocations)) missing.push('preferredLocations');
      if (!hasItems(prefs?.workMode)) missing.push('workMode');
      return missing;
    },
  },
];

const OPTIONAL_SECTIONS: Array<{
  key: string;
  label: string;
  check: (p: ICandidateProfile) => boolean;
}> = [
  { key: 'certifications', label: 'Certifications', check: (p) => hasItems(p.certifications) },
  { key: 'projects', label: 'Projects', check: (p) => hasItems(p.projects) },
  { key: 'socialLinks', label: 'Social links', check: (p) => Boolean(p.socialLinks && Object.values(p.socialLinks).some(Boolean)) },
];

export async function assessProfileReadiness(userId: Types.ObjectId): Promise<ProfileReadinessResult> {
  const profile = await CandidateProfileModel.findOne({ userId }).lean<ICandidateProfile>().exec();
  const resume = await ResumeModel.findOne({ userId, isDefault: true, status: { $ne: 'deleted' } })
    .lean<IResume>()
    .exec();

  const resumeAvailable = Boolean(resume);

  if (!profile) {
    return {
      userId: userId.toString(),
      status: 'no_profile',
      percentage: 0,
      completedSections: [],
      incompleteSections: [...REQUIRED_SECTIONS.map((s) => s.key), ...RECOMMENDED_SECTIONS.map((s) => s.key)],
      details: {},
      resumeAvailable: false,
      missingRequired: REQUIRED_SECTIONS.flatMap((s) => s.missing({} as ICandidateProfile)),
      missingRecommended: RECOMMENDED_SECTIONS.flatMap((s) => s.missing({} as ICandidateProfile)),
      optional: OPTIONAL_SECTIONS.map((s) => s.key),
      recommendations: ['Create a candidate profile to get started.'],
    };
  }

  const details: Record<string, FieldDetail> = {};
  const completedSections: string[] = [];
  const incompleteSections: string[] = [];
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const optional: string[] = [];
  const recommendations: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const completed = section.check(profile);
    details[section.key] = { completed, missing: section.missing(profile) };
    if (completed) completedSections.push(section.key);
    else {
      incompleteSections.push(section.key);
      missingRequired.push(...section.missing(profile));
      recommendations.push(`Complete ${section.label.toLowerCase()}: ${section.missing(profile).join(', ')}`);
    }
  }

  for (const section of RECOMMENDED_SECTIONS) {
    const completed = section.check(profile);
    details[section.key] = { completed, missing: section.missing(profile) };
    if (completed) completedSections.push(section.key);
    else {
      incompleteSections.push(section.key);
      missingRecommended.push(...section.missing(profile));
      recommendations.push(`Add ${section.label.toLowerCase()}: ${section.missing(profile).join(', ')}`);
    }
  }

  for (const section of OPTIONAL_SECTIONS) {
    const completed = section.check(profile);
    details[section.key] = { completed, missing: completed ? [] : [section.key] };
    optional.push(section.key);
    if (!completed) recommendations.push(`Consider adding ${section.label.toLowerCase()}.`);
  }

  const totalSections = REQUIRED_SECTIONS.length + RECOMMENDED_SECTIONS.length;
  const completedCount = completedSections.filter(
    (s) => REQUIRED_SECTIONS.some((r) => r.key === s) || RECOMMENDED_SECTIONS.some((r) => r.key === s),
  ).length;
  const percentage = totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

  let status: ReadinessStatus = 'incomplete';
  if (missingRequired.length === 0 && missingRecommended.length === 0) status = 'ready';
  else if (missingRequired.length === 0) status = 'needs_work';

  if (!resumeAvailable) {
    recommendations.push('Upload a resume to strengthen applications.');
  }

  return {
    userId: userId.toString(),
    status,
    percentage,
    completedSections,
    incompleteSections,
    details,
    resumeAvailable,
    resumeId: resume?._id.toString(),
    missingRequired,
    missingRecommended,
    optional,
    recommendations,
  };
}

/**
 * Job-specific readiness: whether the profile has the information typically
 * needed to apply to a particular job, without altering matching or
 * eligibility. Returns missing profile fields relevant to that job.
 */
export async function assessJobReadiness(userId: Types.ObjectId, job: {
  title?: string;
  requiredSkills?: Array<{ name: string; required?: boolean }>;
  preferredSkills?: Array<{ name: string; required?: boolean }>;
}): Promise<{
  ready: boolean;
  missingRequiredProfileFields: string[];
  missingRecommendedProfileFields: string[];
  matchedSkills: string[];
  missingSkills: string[];
}> {
  const profile = await CandidateProfileModel.findOne({ userId }).lean<ICandidateProfile>().exec();
  const missingRequiredProfileFields: string[] = [];
  const missingRecommendedProfileFields: string[] = [];

  if (!profile) {
    return {
      ready: false,
      missingRequiredProfileFields: ['personal', 'professional', 'skills'],
      missingRecommendedProfileFields: ['experience', 'education', 'preferences'],
      matchedSkills: [],
      missingSkills: (job.requiredSkills ?? []).map((s) => s.name),
    };
  }

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

  if (!norm(profile.firstName) || !norm(personalEmail(profile))) missingRequiredProfileFields.push('personal');
  if (!norm(profile.headline) || !norm(profile.professionalSummary) || profile.yearsOfExperience == null)
    missingRequiredProfileFields.push('professional');
  if (!hasItems(profile.skills)) missingRequiredProfileFields.push('skills');
  if (!hasItems(profile.experience)) missingRecommendedProfileFields.push('experience');
  if (!hasItems(profile.education)) missingRecommendedProfileFields.push('education');

  return {
    ready: missingRequiredProfileFields.length === 0 && missingSkills.length === 0,
    missingRequiredProfileFields,
    missingRecommendedProfileFields,
    matchedSkills,
    missingSkills,
  };
}

function personalEmail(profile: ICandidateProfile): string {
  return norm(profile.email);
}
