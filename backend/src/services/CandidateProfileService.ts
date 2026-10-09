/** Candidate Profile service: business logic for profile management. */

import { Types } from 'mongoose';
import { CandidateProfileRepository } from '../repositories/CandidateProfileRepository.js';
import { CandidateProfileModel, ICandidateProfile, IJobPreferences, ISkill } from '../models/CandidateProfile.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

const profileRepo = new CandidateProfileRepository();

export interface ProfileCompletionResult {
  percentage: number;
  completedSections: string[];
  incompleteSections: string[];
  details: Record<string, { completed: boolean; missing: string[] }>;
}

/**
 * Create a new candidate profile
 */
export async function createProfile(
  userId: Types.ObjectId,
  data: { firstName: string; lastName: string } & Partial<ICandidateProfile>
): Promise<ICandidateProfile> {
  // Check if profile already exists
  const exists = await profileRepo.exists(userId);
  if (exists) {
    throw new ConflictError('Profile already exists for this user');
  }

  // Prepare profile data with userId
  const profileData = {
    userId,
    firstName: data.firstName,
    lastName: data.lastName,
    displayName: data.displayName,
    email: data.email,
    phone: data.phone,
    location: data.location,
    city: data.city,
    state: data.state,
    country: data.country,
    postalCode: data.postalCode,
    headline: data.headline,
    professionalSummary: data.professionalSummary,
    yearsOfExperience: data.yearsOfExperience,
    currentJobTitle: data.currentJobTitle,
    currentCompany: data.currentCompany,
    skills: data.skills || [],
    experience: data.experience || [],
    education: data.education || [],
    certifications: data.certifications || [],
    projects: data.projects || [],
    socialLinks: data.socialLinks || {},
    jobPreferences: data.jobPreferences || {},
  };

  return profileRepo.create(profileData);
}

/**
 * Get candidate profile by user ID
 */
export async function getProfile(userId: Types.ObjectId): Promise<ICandidateProfile | null> {
  return profileRepo.findByUserId(userId);
}

/**
 * Get candidate profile by user ID or throw
 */
export async function getProfileOrThrow(userId: Types.ObjectId): Promise<ICandidateProfile> {
  return profileRepo.findByUserIdOrThrow(userId);
}

/**
 * Update candidate profile (partial update)
 */
export async function updateProfile(
  userId: Types.ObjectId,
  data: Partial<ICandidateProfile>
): Promise<ICandidateProfile> {
  // Remove fields that should not be updated
  const { userId: _userId, createdAt, updatedAt, _id, ...updateData } = data as Record<string, unknown>;

  const profile = await profileRepo.updateByUserId(userId, updateData);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Delete candidate profile
 */
export async function deleteProfile(userId: Types.ObjectId): Promise<boolean> {
  return profileRepo.deleteByUserId(userId);
}

/**
 * Get job preferences
 */
export async function getPreferences(userId: Types.ObjectId): Promise<IJobPreferences | null> {
  const profile = await profileRepo.findByUserId(userId);
  return profile?.jobPreferences ?? null;
}

/**
 * Update job preferences
 */
export async function updatePreferences(
  userId: Types.ObjectId,
  preferences: Partial<IJobPreferences>
): Promise<IJobPreferences> {
  const profile = await profileRepo.updatePreferences(userId, preferences);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile.jobPreferences;
}

/**
 * Add a skill
 */
export async function addSkill(
  userId: Types.ObjectId,
  skill: { name: string; level?: string; years?: number; category?: string }
): Promise<ICandidateProfile> {
  // Validate skill name
  if (!skill.name || skill.name.trim().length === 0) {
    throw new ValidationError('Skill name is required');
  }

  // Validate level if provided
  if (skill.level && !['beginner', 'intermediate', 'advanced', 'expert'].includes(skill.level)) {
    throw new ValidationError('Invalid skill level');
  }

  const profile = await profileRepo.addSkill(userId, skill);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Remove a skill
 */
export async function removeSkill(userId: Types.ObjectId, skillId: string): Promise<ICandidateProfile> {
  const profile = await profileRepo.removeSkill(userId, skillId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Add experience
 */
export async function addExperience(
  userId: Types.ObjectId,
  experience: Record<string, unknown>
): Promise<ICandidateProfile> {
  const profile = await profileRepo.addExperience(userId, experience);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Remove experience
 */
export async function removeExperience(userId: Types.ObjectId, experienceId: string): Promise<ICandidateProfile> {
  const profile = await profileRepo.removeExperience(userId, experienceId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Add education
 */
export async function addEducation(
  userId: Types.ObjectId,
  education: Record<string, unknown>
): Promise<ICandidateProfile> {
  const profile = await profileRepo.addEducation(userId, education);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Remove education
 */
export async function removeEducation(userId: Types.ObjectId, educationId: string): Promise<ICandidateProfile> {
  const profile = await profileRepo.removeEducation(userId, educationId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Add project
 */
export async function addProject(
  userId: Types.ObjectId,
  project: Record<string, unknown>
): Promise<ICandidateProfile> {
  const profile = await profileRepo.addProject(userId, project);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Remove project
 */
export async function removeProject(userId: Types.ObjectId, projectId: string): Promise<ICandidateProfile> {
  const profile = await profileRepo.removeProject(userId, projectId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Add certification
 */
export async function addCertification(
  userId: Types.ObjectId,
  certification: Record<string, unknown>
): Promise<ICandidateProfile> {
  const profile = await profileRepo.addCertification(userId, certification);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Remove certification
 */
export async function removeCertification(
  userId: Types.ObjectId,
  certificationId: string
): Promise<ICandidateProfile> {
  const profile = await profileRepo.removeCertification(userId, certificationId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  return profile;
}

/**
 * Calculate profile completion
 */
export async function getProfileCompletion(userId: Types.ObjectId): Promise<ProfileCompletionResult> {
  const profile = await profileRepo.findByUserId(userId);

  if (!profile) {
    return {
      percentage: 0,
      completedSections: [],
      incompleteSections: [
        'personal',
        'professional',
        'skills',
        'experience',
        'education',
        'projects',
        'preferences',
      ],
      details: {},
    };
  }

  const sections = {
    personal: {
      check: () => !!(profile.firstName && profile.lastName && profile.email && profile.phone),
      fields: ['firstName', 'lastName', 'email', 'phone'],
    },
    professional: {
      check: () => !!(profile.headline && profile.professionalSummary && profile.yearsOfExperience != null),
      fields: ['headline', 'professionalSummary', 'yearsOfExperience'],
    },
    skills: {
      check: () => profile.skills.length > 0,
      fields: ['skills'],
    },
    experience: {
      check: () => profile.experience.length > 0,
      fields: ['experience'],
    },
    education: {
      check: () => profile.education.length > 0,
      fields: ['education'],
    },
    projects: {
      check: () => profile.projects.length > 0,
      fields: ['projects'],
    },
    preferences: {
      check: () => {
        const prefs = profile.jobPreferences;
        return !!(
          (prefs?.desiredRoles?.length ?? 0) > 0 ||
          (prefs?.preferredLocations?.length ?? 0) > 0 ||
          (prefs?.workMode?.length ?? 0) > 0
        );
      },
      fields: ['desiredRoles', 'preferredLocations', 'workMode'],
    },
  };

  const completedSections: string[] = [];
  const incompleteSections: string[] = [];
  const details: Record<string, { completed: boolean; missing: string[] }> = {};

  for (const [sectionName, section] of Object.entries(sections)) {
    const completed = section.check();
    if (completed) {
      completedSections.push(sectionName);
    } else {
      incompleteSections.push(sectionName);
    }
    details[sectionName] = {
      completed,
      missing: completed ? [] : section.fields,
    };
  }

  const percentage = Math.round((completedSections.length / Object.keys(sections).length) * 100);

  return {
    percentage,
    completedSections,
    incompleteSections,
    details,
  };
}