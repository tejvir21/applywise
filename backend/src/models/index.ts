/** Models package initialization. */

export { UserModel } from './User.js';
export { CandidateProfileModel } from './CandidateProfile.js';
export { ResumeModel, ResumeAnalysisModel } from './Resume.js';
export { JobModel, SavedJobModel } from './Job.js';
export { ApplicationModel, ApplicationEventModel, APPLICATION_STATUSES } from './Application.js';
export type {
  ICandidateProfile,
  ISkill,
  IExperience,
  IEducation,
  ICertification,
  IProject,
  ISocialLinks,
  IJobPreferences,
  SkillLevel,
  EmploymentType,
  WorkMode,
  ExperienceLevel,
  SalaryPeriod,
} from './CandidateProfile.js';
export type {
  IResume,
  IResumeAnalysis,
  IStructuredResumeData,
  IPersonalInfo,
  ISkillExtracted,
  IExperienceExtracted,
  IEducationExtracted,
  ICertificationExtracted,
  IProjectExtracted,
  ILinksExtracted,
  IAnalysisWarning,
  ResumeStatus,
  AnalysisStatus,
  ConfidenceLevel,
} from './Resume.js';
export type {
  IJob,
  ISavedJob,
  RemoteType,
  EmploymentType as JobEmploymentType,
  SalaryPeriod as JobSalaryPeriod,
  JobStatus,
  ISkillRequirement,
  IJobSource,
} from './Job.js';
export type {
  IApplication,
  IApplicationEvent,
  IApplicationAnswer,
  IApplicationMaterials,
  IApplicationJobSnapshot,
  ITailoredResumeDraft,
  IMaterialsProvenance,
  ApplicationMode,
  ApplicationStatus,
} from './Application.js';