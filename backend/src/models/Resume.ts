/** Resume and ResumeAnalysis Mongoose models. */

import mongoose, { Document, Schema, Types } from 'mongoose';

// Resume status enum
export type ResumeStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted';

// Analysis status enum
export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Confidence level enum
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

// Structured data interfaces
export interface IPersonalInfo {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
}

export interface ISkillExtracted {
  name: string;
  confidence?: ConfidenceLevel;
  source?: string;
}

export interface IExperienceExtracted {
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
  technologies?: string[];
  confidence?: ConfidenceLevel;
}

export interface IEducationExtracted {
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  grade?: string;
  confidence?: ConfidenceLevel;
}

export interface ICertificationExtracted {
  name?: string;
  issuingOrganization?: string;
  issueDate?: string;
  expirationDate?: string;
  credentialId?: string;
  confidence?: ConfidenceLevel;
}

export interface IProjectExtracted {
  name?: string;
  description?: string;
  technologies?: string[];
  projectUrl?: string;
  repositoryUrl?: string;
  startDate?: string;
  endDate?: string;
  confidence?: ConfidenceLevel;
}

export interface ILinksExtracted {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
  other?: string[];
}

export interface IStructuredResumeData {
  personal?: IPersonalInfo;
  summary?: string;
  skills?: ISkillExtracted[];
  experience?: IExperienceExtracted[];
  education?: IEducationExtracted[];
  certifications?: ICertificationExtracted[];
  projects?: IProjectExtracted[];
  links?: ILinksExtracted;
}

export interface IAnalysisWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

// Resume document interface
export interface IResume extends Document {
  userId: Types.ObjectId;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  status: ResumeStatus;
  version: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ResumeAnalysis document interface
export interface IResumeAnalysis extends Document {
  resumeId: Types.ObjectId;
  userId: Types.ObjectId;
  status: AnalysisStatus;
  extractedText: string;
  structuredData: IStructuredResumeData;
  warnings: IAnalysisWarning[];
  confidence: ConfidenceLevel;
  parserVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

// Resume schema
const resumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    originalFilename: { type: String, required: true, trim: true },
    storedFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['uploaded', 'processing', 'ready', 'failed', 'deleted'],
      default: 'uploaded',
    },
    version: { type: Number, default: 1, min: 1 },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// ResumeAnalysis schema
const resumeAnalysisSchema = new Schema<IResumeAnalysis>(
  {
    resumeId: { type: Schema.Types.ObjectId, required: true, ref: 'Resume' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    extractedText: { type: String, default: '' },
    structuredData: {
      personal: {
        name: { type: String },
        email: { type: String },
        phone: { type: String },
        location: { type: String },
      },
      summary: { type: String },
      skills: [
        {
          name: { type: String, required: true },
          confidence: { type: String, enum: ['high', 'medium', 'low', 'uncertain'] },
          source: { type: String },
        },
      ],
      experience: [
        {
          company: { type: String },
          title: { type: String },
          startDate: { type: String },
          endDate: { type: String },
          current: { type: Boolean },
          description: { type: String },
          technologies: [{ type: String }],
          confidence: { type: String, enum: ['high', 'medium', 'low', 'uncertain'] },
        },
      ],
      education: [
        {
          institution: { type: String },
          degree: { type: String },
          fieldOfStudy: { type: String },
          startDate: { type: String },
          endDate: { type: String },
          current: { type: Boolean },
          grade: { type: String },
          confidence: { type: String, enum: ['high', 'medium', 'low', 'uncertain'] },
        },
      ],
      certifications: [
        {
          name: { type: String },
          issuingOrganization: { type: String },
          issueDate: { type: String },
          expirationDate: { type: String },
          credentialId: { type: String },
          confidence: { type: String, enum: ['high', 'medium', 'low', 'uncertain'] },
        },
      ],
      projects: [
        {
          name: { type: String },
          description: { type: String },
          technologies: [{ type: String }],
          projectUrl: { type: String },
          repositoryUrl: { type: String },
          startDate: { type: String },
          endDate: { type: String },
          confidence: { type: String, enum: ['high', 'medium', 'low', 'uncertain'] },
        },
      ],
      links: {
        github: { type: String },
        linkedin: { type: String },
        portfolio: { type: String },
        website: { type: String },
        other: [{ type: String }],
      },
    },
    warnings: [
      {
        field: { type: String, required: true },
        message: { type: String, required: true },
        severity: { type: String, enum: ['warning', 'error'], required: true },
      },
    ],
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low', 'uncertain'],
      default: 'uncertain',
    },
    parserVersion: { type: String, required: true, default: '1.0.0' },
  },
  { timestamps: true }
);

// Indexes
resumeSchema.index({ userId: 1, isDefault: 1 });
resumeSchema.index({ userId: 1, createdAt: -1 });
resumeAnalysisSchema.index({ resumeId: 1 });
resumeAnalysisSchema.index({ userId: 1, createdAt: -1 });

// Validation: only one default resume per user
resumeSchema.pre('save', async function (next) {
  if (this.isDefault) {
    await mongoose.model('Resume').updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { $set: { isDefault: false } },
    );
  }
  next();
});

// When deleting a default resume, clear the default flag
resumeSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  if (this.isDefault) {
    const nextResume = await mongoose.model('Resume').findOne({
      userId: this.userId,
      _id: { $ne: this._id },
      status: { $ne: 'deleted' },
    }).sort({ createdAt: -1 });
    if (nextResume) {
      nextResume.isDefault = true;
      await nextResume.save();
    }
  }
  next();
});

export const ResumeModel = mongoose.model<IResume>('Resume', resumeSchema);
export const ResumeAnalysisModel = mongoose.model<IResumeAnalysis>('ResumeAnalysis', resumeAnalysisSchema);