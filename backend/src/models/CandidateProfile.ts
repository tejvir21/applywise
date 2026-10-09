/** Candidate Profile Mongoose model. */

import mongoose, { Document, Schema, Types } from 'mongoose';

// Skill level enum
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

// Employment type enum
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';

// Work mode enum
export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'flexible';

// Experience level enum
export type ExperienceLevel = 'internship' | 'entry' | 'junior' | 'mid' | 'senior' | 'lead';

// Salary period enum
export type SalaryPeriod = 'hourly' | 'monthly' | 'yearly';

// Skill schema
export interface ISkill {
  name: string;
  level?: SkillLevel;
  years?: number;
  category?: string; // technical, soft, tools, languages, etc.
}

// Experience schema
export interface IExperience {
  company: string;
  jobTitle: string;
  employmentType: EmploymentType;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType?: WorkMode;
  startDate: Date;
  endDate?: Date;
  current: boolean;
  description?: string;
  achievements?: string[];
  technologies?: string[];
}

// Education schema
export interface IEducation {
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  startDate: Date;
  endDate?: Date;
  current: boolean;
  grade?: string;
  description?: string;
}

// Certification schema
export interface ICertification {
  name: string;
  issuingOrganization: string;
  issueDate: Date;
  expirationDate?: Date;
  credentialId?: string;
  credentialUrl?: string;
}

// Project schema
export interface IProject {
  name: string;
  description?: string;
  technologies?: string[];
  projectUrl?: string;
  repositoryUrl?: string;
  startDate?: Date;
  endDate?: Date;
  highlights?: string[];
}

// Social links schema
export interface ISocialLinks {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
  other?: string[];
}

// Job preferences schema
export interface IJobPreferences {
  desiredRoles: string[];
  preferredLocations: string[];
  preferredCountries: string[];
  workMode: WorkMode[];
  employmentTypes: EmploymentType[];
  experienceLevels: ExperienceLevel[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  industries: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  excludedCompanies: string[];
  excludedJobTypes: EmploymentType[];
}

// Candidate Profile document interface
export interface ICandidateProfile extends Document {
  userId: Types.ObjectId;
  // Personal information
  firstName: string;
  lastName: string;
  displayName?: string;
  email?: string; // For application purposes (different from auth email)
  phone?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  // Professional information
  headline?: string;
  professionalSummary?: string;
  yearsOfExperience?: number;
  currentJobTitle?: string;
  currentCompany?: string;
  // Structured sections
  skills: ISkill[];
  experience: IExperience[];
  education: IEducation[];
  certifications: ICertification[];
  projects: IProject[];
  socialLinks: ISocialLinks;
  // Job preferences
  jobPreferences: IJobPreferences;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// Skill schema
const skillSchema = new Schema<ISkill>({
  name: { type: String, required: true, trim: true },
  level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'] },
  years: { type: Number, min: 0, max: 50 },
  category: { type: String, trim: true },
}, { _id: true });

// Experience schema
const experienceSchema = new Schema<IExperience>({
  company: { type: String, required: true, trim: true },
  jobTitle: { type: String, required: true, trim: true },
  employmentType: {
    type: String,
    required: true,
    enum: ['full_time', 'part_time', 'contract', 'internship', 'freelance'],
  },
  location: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  remoteType: { type: String, enum: ['remote', 'hybrid', 'onsite', 'flexible'] },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  current: { type: Boolean, required: true, default: false },
  description: { type: String, trim: true },
  achievements: [{ type: String, trim: true }],
  technologies: [{ type: String, trim: true }],
}, { _id: true });

// Education schema
const educationSchema = new Schema<IEducation>({
  institution: { type: String, required: true, trim: true },
  degree: { type: String, required: true, trim: true },
  fieldOfStudy: { type: String, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date },
  current: { type: Boolean, required: true, default: false },
  grade: { type: String, trim: true },
  description: { type: String, trim: true },
}, { _id: true });

// Certification schema
const certificationSchema = new Schema<ICertification>({
  name: { type: String, required: true, trim: true },
  issuingOrganization: { type: String, required: true, trim: true },
  issueDate: { type: Date, required: true },
  expirationDate: { type: Date },
  credentialId: { type: String, trim: true },
  credentialUrl: { type: String, trim: true },
}, { _id: true });

// Project schema
const projectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  technologies: [{ type: String, trim: true }],
  projectUrl: { type: String, trim: true },
  repositoryUrl: { type: String, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  highlights: [{ type: String, trim: true }],
}, { _id: true });

// Social links schema
const socialLinksSchema = new Schema<ISocialLinks>({
  github: { type: String, trim: true },
  linkedin: { type: String, trim: true },
  portfolio: { type: String, trim: true },
  website: { type: String, trim: true },
  other: [{ type: String, trim: true }],
}, { _id: false });

// Job preferences schema
const jobPreferencesSchema = new Schema<IJobPreferences>({
  desiredRoles: [{ type: String, trim: true }],
  preferredLocations: [{ type: String, trim: true }],
  preferredCountries: [{ type: String, trim: true }],
  workMode: [{ type: String, enum: ['remote', 'hybrid', 'onsite', 'flexible'] }],
  employmentTypes: [{ type: String, enum: ['full_time', 'part_time', 'contract', 'internship', 'freelance'] }],
  experienceLevels: [{ type: String, enum: ['internship', 'entry', 'junior', 'mid', 'senior', 'lead'] }],
  salaryMin: { type: Number, min: 0 },
  salaryMax: { type: Number, min: 0 },
  salaryCurrency: { type: String, default: 'USD', trim: true, uppercase: true },
  salaryPeriod: { type: String, enum: ['hourly', 'monthly', 'yearly'], default: 'yearly' },
  industries: [{ type: String, trim: true }],
  requiredSkills: [{ type: String, trim: true }],
  preferredSkills: [{ type: String, trim: true }],
  excludedCompanies: [{ type: String, trim: true }],
  excludedJobTypes: [{ type: String, enum: ['full_time', 'part_time', 'contract', 'internship', 'freelance'] }],
}, { _id: false });

// Candidate Profile schema
const candidateProfileSchema = new Schema<ICandidateProfile>({
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  // Personal
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  displayName: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  location: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  // Professional
  headline: { type: String, trim: true },
  professionalSummary: { type: String, trim: true },
  yearsOfExperience: { type: Number, min: 0, max: 50 },
  currentJobTitle: { type: String, trim: true },
  currentCompany: { type: String, trim: true },
  // Sections
  skills: { type: [skillSchema], default: [] },
  experience: { type: [experienceSchema], default: [] },
  education: { type: [educationSchema], default: [] },
  certifications: { type: [certificationSchema], default: [] },
  projects: { type: [projectSchema], default: [] },
  socialLinks: { type: socialLinksSchema, default: {} },
  // Preferences
  jobPreferences: { type: jobPreferencesSchema, default: {} },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
candidateProfileSchema.index({ userId: 1 }, { unique: true });

// Virtual for full name
candidateProfileSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Validation: experience date ranges
candidateProfileSchema.pre('validate', function(next) {
  // Validate experience dates
  for (const exp of this.experience) {
    if (!exp.current && exp.endDate && exp.endDate < exp.startDate) {
      this.invalidate('experience', `End date cannot be before start date for experience at ${exp.company}`);
    }
  }
  // Validate education dates
  for (const edu of this.education) {
    if (!edu.current && edu.endDate && edu.endDate < edu.startDate) {
      this.invalidate('education', `End date cannot be before start date for education at ${edu.institution}`);
    }
  }
  // Validate salary range
  if (this.jobPreferences?.salaryMin != null && this.jobPreferences?.salaryMax != null) {
    if (this.jobPreferences.salaryMin > this.jobPreferences.salaryMax) {
      this.invalidate('jobPreferences', 'Minimum salary cannot exceed maximum salary');
    }
  }
  next();
});

export const CandidateProfileModel = mongoose.model<ICandidateProfile>('CandidateProfile', candidateProfileSchema);