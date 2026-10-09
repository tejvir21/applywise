/** Job Mongoose model. */

import mongoose, { Document, Schema, Types } from "mongoose";

// Remote type enum
export type RemoteType =
  | "remote"
  | "hybrid"
  | "onsite"
  | "flexible"
  | "unknown";

// Employment type enum
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "freelance"
  | "unknown";

// Experience level enum
export type ExperienceLevel =
  | "internship"
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "unknown";

// Salary period enum
export type SalaryPeriod = "hourly" | "monthly" | "yearly";

// Job status enum
export type JobStatus = "active" | "expired" | "closed" | "draft";

// Skill requirement interface
export interface ISkillRequirement {
  name: string;
  required: boolean;
  confidence?: "high" | "medium" | "low";
  source?: string;
}

// Job source interface
export interface IJobSource {
  name: string;
  sourceJobId?: string;
  sourceUrl?: string;
  discoveredAt: Date;
}

// Job document interface
export interface IJob extends Document {
  // Core job information
  title: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  requiredSkills: ISkillRequirement[];
  preferredSkills: ISkillRequirement[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  applicationUrl?: string;
  // Source tracking
  sources: IJobSource[];
  // Deduplication
  normalizedKey?: string;
  // Ownership (for manual/user-created jobs)
  userId?: Types.ObjectId;
  // Status and metadata
  status: JobStatus;
  postedAt?: Date;
  discoveredAt: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Saved job document interface
export interface ISavedJob extends Document {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  notes?: string;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Skill requirement schema
const skillRequirementSchema = new Schema<ISkillRequirement>(
  {
    name: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    source: { type: String, trim: true },
  },
  { _id: false },
);

// Job source schema
const jobSourceSchema = new Schema<IJobSource>(
  {
    name: { type: String, required: true, trim: true },
    sourceJobId: { type: String, trim: true },
    sourceUrl: { type: String, trim: true },
    discoveredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Job schema
const jobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    companyWebsite: { type: String, trim: true },
    location: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    remoteType: {
      type: String,
      required: true,
      enum: ["remote", "hybrid", "onsite", "flexible", "unknown"],
      default: "unknown",
    },
    employmentType: {
      type: String,
      required: true,
      enum: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "freelance",
        "unknown",
      ],
      default: "unknown",
    },
    experienceLevel: {
      type: String,
      required: true,
      enum: [
        "internship",
        "entry",
        "junior",
        "mid",
        "senior",
        "lead",
        "unknown",
      ],
      default: "unknown",
    },
    description: { type: String, trim: true },
    responsibilities: [{ type: String, trim: true, maxlength: 500 }],
    requirements: [{ type: String, trim: true, maxlength: 500 }],
    requiredSkills: { type: [skillRequirementSchema], default: [] },
    preferredSkills: { type: [skillRequirementSchema], default: [] },
    salaryMin: { type: Number, min: 0 },
    salaryMax: { type: Number, min: 0 },
    salaryCurrency: {
      type: String,
      default: "USD",
      trim: true,
      uppercase: true,
      maxlength: 3,
    },
    salaryPeriod: {
      type: String,
      enum: ["hourly", "monthly", "yearly"],
      default: "yearly",
    },
    applicationUrl: { type: String, trim: true },
    sources: { type: [jobSourceSchema], default: [] },
    normalizedKey: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "expired", "closed", "draft"],
      default: "active",
    },
    postedAt: { type: Date },
    discoveredAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true },
);

// Indexes
jobSchema.index({ companyName: 1 });
jobSchema.index({ title: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ remoteType: 1 });
jobSchema.index({ employmentType: 1 });
jobSchema.index({ experienceLevel: 1 });
jobSchema.index({ postedAt: -1 });
jobSchema.index({ discoveredAt: -1 });
// Compound indexes for common queries
jobSchema.index({ status: 1, postedAt: -1 });
jobSchema.index({ status: 1, remoteType: 1 });
jobSchema.index({ status: 1, employmentType: 1 });
jobSchema.index({ status: 1, experienceLevel: 1 });
// Unique indexes for deduplication.
// normalizedKey: unique per normalized job (manual dedup); sparse so jobs
// without a key never collide.
// sources.name + sources.sourceJobId: unique per external job. sourceJobId is
// optional, so this is a partial (not sparse) unique index covering only entries
// where sourceJobId is a string. Manual entries without a sourceJobId are
// excluded entirely and never collide with each other.
jobSchema.index({ normalizedKey: 1 }, { unique: true, sparse: true });
jobSchema.index(
  { "sources.name": 1, "sources.sourceJobId": 1 },
  {
    unique: true,
    // Partial (not sparse): only entries with a real sourceJobId participate.
    // NOTE: MongoDB rejects $ne:null in partialFilterExpression (code 67,
    // CannotCreateIndex), which silently prevented this index from ever being
    // created. $type:'string' is supported and excludes both missing and
    // null sourceJobId values, so manual entries never collide.
    partialFilterExpression: { "sources.sourceJobId": { $type: 'string' } },
  },
);

// Saved job schema
const savedJobSchema = new Schema<ISavedJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Job",
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 1000 },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Compound unique index for saved jobs
savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
savedJobSchema.index({ userId: 1, savedAt: -1 });

export const JobModel = mongoose.model<IJob>("Job", jobSchema);
export const SavedJobModel = mongoose.model<ISavedJob>(
  "SavedJob",
  savedJobSchema,
);
