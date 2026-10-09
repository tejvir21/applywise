/** ResumeAnalysis repository for database operations. */

import { Types } from 'mongoose';
import { ResumeAnalysisModel, IResumeAnalysis, AnalysisStatus, IStructuredResumeData, IAnalysisWarning } from '../models/Resume.js';
import { NotFoundError } from '../utils/errors.js';

type LeanAnalysis = IResumeAnalysis & { _id: Types.ObjectId };

export interface CreateAnalysisData {
  resumeId: Types.ObjectId;
  userId: Types.ObjectId;
  status: AnalysisStatus;
}

export interface UpdateAnalysisData {
  status?: AnalysisStatus;
  extractedText?: string;
  structuredData?: IStructuredResumeData;
  warnings?: IAnalysisWarning[];
  confidence?: string;
  parserVersion?: string;
  [key: string]: unknown;
}

export class ResumeAnalysisRepository {
  /**
   * Create a new analysis document
   */
  async create(data: CreateAnalysisData): Promise<IResumeAnalysis> {
    const analysis = new ResumeAnalysisModel(data);
    return analysis.save();
  }

  /**
   * Find analysis by resume ID
   */
  async findByResumeId(resumeId: Types.ObjectId | string): Promise<IResumeAnalysis | null> {
    return ResumeAnalysisModel.findOne({ resumeId }).lean<LeanAnalysis>().exec();
  }

  /**
   * Find analysis by resume ID and user ID (ownership check)
   */
  async findByResumeIdAndUserId(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<IResumeAnalysis | null> {
    return ResumeAnalysisModel.findOne({ resumeId, userId }).lean<LeanAnalysis>().exec();
  }

  /**
   * Find analysis by resume ID and user ID or throw
   */
  async findByResumeIdAndUserIdOrThrow(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<IResumeAnalysis> {
    const analysis = await this.findByResumeIdAndUserId(resumeId, userId);
    if (!analysis) {
      throw new NotFoundError('ResumeAnalysis', resumeId.toString());
    }
    return analysis;
  }

  /**
   * Update analysis
   */
  async update(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string, data: UpdateAnalysisData): Promise<IResumeAnalysis | null> {
    const { userId: _userId, resumeId: _resumeId, createdAt, updatedAt, _id, ...updateData } = data;
    return ResumeAnalysisModel.findOneAndUpdate(
      { resumeId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean<LeanAnalysis>().exec();
  }

  /**
   * Delete analysis by resume ID
   */
  async deleteByResumeId(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<boolean> {
    const result = await ResumeAnalysisModel.deleteOne({ resumeId, userId }).exec();
    return result.deletedCount > 0;
  }

  /**
   * Delete analysis by ID
   */
  async deleteById(analysisId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<boolean> {
    const result = await ResumeAnalysisModel.deleteOne({ _id: analysisId, userId }).exec();
    return result.deletedCount > 0;
  }
}