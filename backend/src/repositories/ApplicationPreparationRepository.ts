/** Application preparation repository (Phase 8.3.13). */

import { Types } from 'mongoose';
import {
  ApplicationPreparationModel,
  IApplicationPreparation,
} from '../models/ApplicationPreparation.js';
import { NotFoundError } from '../utils/errors.js';

type LeanPreparation = IApplicationPreparation & { _id: Types.ObjectId };

export interface CreatePreparationData {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  jobSnapshot: { title: string; companyName: string };
  resumeId?: Types.ObjectId;
  resumeVersion?: number;
  status?: PreparationStatus;
  missingInformation?: string[];
  answers?: unknown;
}

export interface UpdatePreparationData {
  status?: PreparationStatus;
  missingInformation?: string[];
  tailoredResume?: unknown;
  coverLetter?: unknown;
  answers?: unknown;
  materialsProvenance?: unknown;
  [key: string]: unknown;
}

export type PreparationStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export class ApplicationPreparationRepository {
  async create(data: CreatePreparationData): Promise<IApplicationPreparation> {
    const preparation = new ApplicationPreparationModel(data);
    return preparation.save();
  }

  async findByIdAndUserId(
    preparationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<IApplicationPreparation | null> {
    return ApplicationPreparationModel.findOne({
      _id: preparationId,
      userId,
    }).lean<LeanPreparation>().exec();
  }

  async findByIdAndUserIdOrThrow(
    preparationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<IApplicationPreparation> {
    const prep = await this.findByIdAndUserId(preparationId, userId);
    if (!prep) {
      throw new NotFoundError('ApplicationPreparation', preparationId.toString());
    }
    return prep;
  }

  async findActiveByUserIdAndJobId(
    userId: Types.ObjectId | string,
    jobId: Types.ObjectId | string,
  ): Promise<IApplicationPreparation | null> {
    return ApplicationPreparationModel.findOne({
      userId,
      jobId,
      status: { $ne: 'CANCELLED' },
    }).lean<LeanPreparation>().exec();
  }

  async listByUserId(
    userId: Types.ObjectId | string,
    options: {
      status?: PreparationStatus;
      page?: number;
      pageSize?: number;
      query?: string;
    } = {},
  ): Promise<{
    preparations: IApplicationPreparation[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { status, page = 1, pageSize = 20, query } = options;
    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;
    if (query) {
      filter.$or = [
        { 'jobSnapshot.title': { $regex: query, $options: 'i' } },
        { 'jobSnapshot.companyName': { $regex: query, $options: 'i' } },
      ];
    }

    const limit = Math.min(pageSize, 100);
    const skip = (page - 1) * limit;

    const [preparations, total] = await Promise.all([
      ApplicationPreparationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<LeanPreparation>()
        .exec(),
      ApplicationPreparationModel.countDocuments(filter).exec(),
    ]);

    return {
      preparations: preparations as unknown as IApplicationPreparation[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(
    preparationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
    data: UpdatePreparationData,
  ): Promise<IApplicationPreparation | null> {
    const { userId: _userId, createdAt, updatedAt, _id, ...updateData } = data;
    return ApplicationPreparationModel.findOneAndUpdate(
      { _id: preparationId, userId },
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean<LeanPreparation>().exec();
  }

  async delete(
    preparationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<boolean> {
    const result = await ApplicationPreparationModel.findOneAndUpdate(
      { _id: preparationId, userId },
      { $set: { status: 'CANCELLED' } },
    ).exec();
    return !!result;
  }
}
