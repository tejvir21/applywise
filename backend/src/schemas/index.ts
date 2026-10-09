/** Schemas package initialization. */

// Auth schemas
export {
  registerSchema,
  loginSchema,
  refreshSchema,
  tokenResponseSchema,
  currentUserResponseSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type TokenResponse,
  type CurrentUserResponse,
} from './auth.js';

// Profile schemas
export {
  skillSchema,
  experienceSchema,
  educationSchema,
  certificationSchema,
  projectSchema,
  socialLinksSchema,
  jobPreferencesSchema,
  createProfileSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  addSkillSchema,
  addExperienceSchema,
  addEducationSchema,
  addProjectSchema,
  addCertificationSchema,
  skillIdParamSchema,
  experienceIdParamSchema,
  educationIdParamSchema,
  projectIdParamSchema,
  certificationIdParamSchema,
  type SkillInput,
  type ExperienceInput,
  type EducationInput,
  type CertificationInput,
  type ProjectInput,
  type SocialLinksInput,
  type JobPreferencesInput,
  type CreateProfileInput,
  type UpdateProfileInput,
  type UpdatePreferencesInput,
  type AddSkillInput,
  type AddExperienceInput,
  type AddEducationInput,
  type AddProjectInput,
  type AddCertificationInput,
} from './profile.js';

// Resume schemas
export {
  uploadResumeSchema,
  setDefaultResumeSchema,
  analyzeResumeSchema,
  resumeIdParamSchema,
  importToProfileSchema,
  type UploadResumeInput,
  type SetDefaultResumeInput,
  type AnalyzeResumeInput,
  type ResumeIdParam,
  type ImportToProfileInput,
} from './resume.js';

// Job schemas
export {
  createManualJobSchema,
  updateJobSchema,
  jobIdParamSchema,
  saveJobSchema,
  importMockJobsSchema,
  importFromSourceSchema,
  savedJobIdParamSchema,
  skillRequirementSchema,
  jobSourceSchema,
  type CreateManualJobInput,
  type UpdateJobInput,
  type JobIdParam,
  type SaveJobInput,
  type ImportMockJobsInput,
  type ImportFromSourceInput,
  type SavedJobIdParam,
} from './job.js';