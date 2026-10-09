/** Resume repository for database operations. */

import { Types } from 'mongoose';
import { ResumeModel, IResume, ResumeStatus } from '../models/Resume.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

type LeanResume = IResume & { _id: Types.ObjectId };

export interface CreateResumeData {
  userId: Types.ObjectId;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  status?: string;
  version?: number;
  isDefault?: boolean;
}

export interface UpdateResumeData {
  status?: ResumeStatus;
  isDefault?: boolean;
  version?: number;
  [key: string]: unknown;
}

export class ResumeRepository {
  /**
   * Create a new resume document
   */
  async create(data: CreateResumeData): Promise<IResume> {
    const resume = new ResumeModel(data);
    return resume.save();
  }

  /**
   * Find resume by ID and user ID (ownership check)
   */
  async findByIdAndUserId(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<IResume | null> {
    return ResumeModel.findOne({ _id: resumeId, userId }).lean<LeanResume>().exec();
  }

  /**
   * Find resume by ID and user ID or throw
   */
  async findByIdAndUserIdOrThrow(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<IResume> {
    const resume = await this.findByIdAndUserId(resumeId, userId);
    if (!resume) {
      throw new NotFoundError('Resume', resumeId.toString());
    }
    return resume;
  }

  /**
   * Find resumes by user ID
   */
  async findByUserId(userId: Types.ObjectId | string): Promise<IResume[]> {
    const resumes = await ResumeModel.find({ userId, status: { $ne: 'deleted' } })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean()
      .exec();
    return resumes as unknown as IResume[];
  }

  /**
   * Get default resume for user
   */
  async getDefaultByUserId(userId: Types.ObjectId | string): Promise<IResume | null> {
    return ResumeModel.findOne({ userId, isDefault: true, status: { $ne: 'deleted' } }).lean<LeanResume>().exec();
  }

  /**
   * Update resume
   */
  async update(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string, data: UpdateResumeData): Promise<IResume | null> {
    const { userId: _userId, createdAt, updatedAt, _id, ...updateData } = data;
    return ResumeModel.findOneAndUpdate(
      { _id: resumeId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean<LeanResume>().exec();
  }

  /**
   * Set resume as default (clears other defaults for user)
   */
  async setDefault(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<IResume | null> {
    // First, unset current default
    await ResumeModel.updateMany(
      { userId, isDefault: true },
      { $set: { isDefault: false } }
    ).exec();
    
    // Set new default
    return ResumeModel.findOneAndUpdate(
      { _id: resumeId, userId },
      { $set: { isDefault: true } },
      { new: true, runValidators: true }
    ).lean<LeanResume>().exec();
  }

  /**
   * Delete resume (soft delete by marking status)
   */
  async delete(resumeId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<boolean> {
    const result = await ResumeModel.findOneAndUpdate(
      { _id: resumeId, userId },
      { $set: { status: 'deleted' } }
    ).exec();
    return !!result;
  }

  /**
   * Count user's resumes
   */
  async countByUserId(userId: Types.ObjectId | string): Promise<number> {
    return ResumeModel.countDocuments({ userId, status: { $ne: 'deleted' } }).exec();
  }
}