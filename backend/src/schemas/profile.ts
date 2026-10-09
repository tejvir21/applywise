/** Candidate Profile Zod validation schemas. */

import { z } from 'zod';

// Skill level
const skillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional();

// Employment type
const employmentTypeSchema = z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']);

// Work mode
const workModeSchema = z.enum(['remote', 'hybrid', 'onsite', 'flexible']);

// Experience level
const experienceLevelSchema = z.enum(['internship', 'entry', 'junior', 'mid', 'senior', 'lead']);

// Salary period
const salaryPeriodSchema = z.enum(['hourly', 'monthly', 'yearly']);

// Skill schema
export const skillSchema = z.object({
  name: z.string().min(1).max(100),
  level: skillLevelSchema,
  years: z.number().int().min(0).max(50).optional(),
  category: z.string().max(50).optional(),
});

// Experience schema
export const experienceSchema = z.object({
  company: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  employmentType: employmentTypeSchema,
  location: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  remoteType: workModeSchema.optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  current: z.boolean(),
  description: z.string().max(5000).optional(),
  achievements: z.array(z.string().max(500)).optional(),
  technologies: z.array(z.string().max(100)).optional(),
}).refine(
  (data) => data.current || data.endDate,
  { message: 'End date is required when not current', path: ['endDate'] }
).refine(
  (data) => !data.endDate || new Date(data.startDate) <= new Date(data.endDate!),
  { message: 'End date cannot be before start date', path: ['endDate'] }
);

// Education schema
export const educationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(200),
  fieldOfStudy: z.string().max(200).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  current: z.boolean(),
  grade: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
}).refine(
  (data) => data.current || data.endDate,
  { message: 'End date is required when not current', path: ['endDate'] }
).refine(
  (data) => !data.endDate || new Date(data.startDate) <= new Date(data.endDate!),
  { message: 'End date cannot be before start date', path: ['endDate'] }
);

// Certification schema
export const certificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuingOrganization: z.string().min(1).max(200),
  issueDate: z.string().datetime(),
  expirationDate: z.string().datetime().optional().nullable(),
  credentialId: z.string().max(100).optional(),
  credentialUrl: z.string().url().optional(),
});

// Project schema
export const projectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  technologies: z.array(z.string().max(100)).optional(),
  projectUrl: z.string().url().optional(),
  repositoryUrl: z.string().url().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  highlights: z.array(z.string().max(500)).optional(),
});

// Social links schema
export const socialLinksSchema = z.object({
  github: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  portfolio: z.string().url().optional(),
  website: z.string().url().optional(),
  other: z.array(z.string().url()).optional(),
});

// Job preferences schema
export const jobPreferencesSchema = z.object({
  desiredRoles: z.array(z.string().min(1).max(200)).optional(),
  preferredLocations: z.array(z.string().min(1).max(200)).optional(),
  preferredCountries: z.array(z.string().min(1).max(200)).optional(),
  workMode: z.array(workModeSchema).optional(),
  employmentTypes: z.array(employmentTypeSchema).optional(),
  experienceLevels: z.array(experienceLevelSchema).optional(),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  salaryCurrency: z.string().length(3).optional(),
  salaryPeriod: salaryPeriodSchema.optional(),
  industries: z.array(z.string().min(1).max(100)).optional(),
  requiredSkills: z.array(z.string().min(1).max(100)).optional(),
  preferredSkills: z.array(z.string().min(1).max(100)).optional(),
  excludedCompanies: z.array(z.string().min(1).max(200)).optional(),
  excludedJobTypes: z.array(employmentTypeSchema).optional(),
}).refine(
  (data) => data.salaryMin == null || data.salaryMax == null || data.salaryMin <= data.salaryMax,
  { message: 'Minimum salary cannot exceed maximum salary', path: ['salaryMax'] }
);

// Main profile schema
export const createProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    displayName: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
    location: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    headline: z.string().max(300).optional(),
    professionalSummary: z.string().max(5000).optional(),
    yearsOfExperience: z.number().int().min(0).max(50).optional(),
    currentJobTitle: z.string().max(200).optional(),
    currentCompany: z.string().max(200).optional(),
    skills: z.array(skillSchema).optional(),
    experience: z.array(experienceSchema).optional(),
    education: z.array(educationSchema).optional(),
    certifications: z.array(certificationSchema).optional(),
    projects: z.array(projectSchema).optional(),
    socialLinks: socialLinksSchema.optional(),
    jobPreferences: jobPreferencesSchema.optional(),
  }),
});

// Update profile schema (all fields optional)
export const updateProfileSchema = z.object({
  body: createProfileSchema.shape.body.partial(),
});

// Preferences schema
export const updatePreferencesSchema = z.object({
  body: jobPreferencesSchema,
});

// Add skill schema
export const addSkillSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    level: skillLevelSchema,
    years: z.number().int().min(0).max(50).optional(),
    category: z.string().max(50).optional(),
  }),
});

// Add experience schema
export const addExperienceSchema = z.object({
  body: experienceSchema,
});

// Add education schema
export const addEducationSchema = z.object({
  body: educationSchema,
});

// Add project schema
export const addProjectSchema = z.object({
  body: projectSchema,
});

// Add certification schema
export const addCertificationSchema = z.object({
  body: certificationSchema,
});

// ID param schemas
export const skillIdParamSchema = z.object({
  params: z.object({
    skillId: z.string().min(1),
  }),
});

export const experienceIdParamSchema = z.object({
  params: z.object({
    experienceId: z.string().min(1),
  }),
});

export const educationIdParamSchema = z.object({
  params: z.object({
    educationId: z.string().min(1),
  }),
});

export const projectIdParamSchema = z.object({
  params: z.object({
    projectId: z.string().min(1),
  }),
});

export const certificationIdParamSchema = z.object({
  params: z.object({
    certificationId: z.string().min(1),
  }),
});

// Type exports
export type SkillInput = z.infer<typeof skillSchema>;
export type ExperienceInput = z.infer<typeof experienceSchema>;
export type EducationInput = z.infer<typeof educationSchema>;
export type CertificationInput = z.infer<typeof certificationSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;
export type JobPreferencesInput = z.infer<typeof jobPreferencesSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema.shape.body>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema.shape.body>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema.shape.body>;
export type AddSkillInput = z.infer<typeof addSkillSchema.shape.body>;
export type AddExperienceInput = z.infer<typeof addExperienceSchema.shape.body>;
export type AddEducationInput = z.infer<typeof addEducationSchema.shape.body>;
export type AddProjectInput = z.infer<typeof addProjectSchema.shape.body>;
export type AddCertificationInput = z.infer<typeof addCertificationSchema.shape.body>;