/** Application repository for database operations (Phase 6). */

import { Types } from 'mongoose';
import {
  ApplicationModel,
  ApplicationEventModel,
  IApplication,
  IApplicationEvent,
  ApplicationStatus,
} from '../models/Application.js';

type LeanApplication = IApplication & { _id: Types.ObjectId };

export interface CreateApplicationData {
  userId: Types.ObjectId | string;
  jobId: Types.ObjectId | string;
  resumeId?: Types.ObjectId | string;
  resumeVersion?: number;
  jobSnapshot: { title: string; companyName: string };
  matchScore?: number;
  matchEligible?: boolean;
  matchExplanation?: Record<string, unknown>;
  mode?: 'auto' | 'permission';
  materials?: {
    coverLetter?: string;
    answers?: Array<{ question: string; answer: string; verified?: boolean; sensitive?: boolean }>;
    notes?: string;
  };
  idempotencyKey?: string;
}

export interface ApplicationEventData {
  applicationId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  type: string;
  fromStatus?: ApplicationStatus;
  toStatus?: ApplicationStatus;
  message?: string;
}

export class ApplicationRepository {
  async create(data: CreateApplicationData) {
    const application = new ApplicationModel(data);
    return application.save();
  }

  async findByIdAndUserId(applicationId: Types.ObjectId | string, userId: Types.ObjectId | string) {
    return ApplicationModel.findOne({ _id: applicationId, userId }).lean<LeanApplication>().exec();
  }

  async findLiveByUserIdAndJobId(userId: Types.ObjectId | string, jobId: Types.ObjectId | string) {
    return ApplicationModel.findOne({ userId, jobId, status: { $ne: 'CANCELLED' } })
      .lean<LeanApplication>()
      .exec();
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return ApplicationModel.findOne({ idempotencyKey }).lean<LeanApplication>().exec();
  }

  async updateStatus(
    applicationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
    status: ApplicationStatus,
    extra: Record<string, unknown> = {},
  ) {
    return ApplicationModel.findOneAndUpdate(
      { _id: applicationId, userId },
      { $set: { status, ...extra } },
      { new: true, runValidators: true },
    )
      .lean<LeanApplication>()
      .exec();
  }

  async updateDraft(
    applicationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
    data: {
      resumeId?: Types.ObjectId | string;
      resumeVersion?: number;
      mode?: 'auto' | 'permission';
      materials?: CreateApplicationData['materials'];
    },
  ) {
    const set: Record<string, unknown> = {};
    if (data.resumeId !== undefined) set.resumeId = data.resumeId;
    if (data.resumeVersion !== undefined) set.resumeVersion = data.resumeVersion;
    if (data.mode !== undefined) set.mode = data.mode;
    if (data.materials !== undefined) set.materials = data.materials;
    return ApplicationModel.findOneAndUpdate(
      { _id: applicationId, userId, status: 'DRAFT' },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<LeanApplication>()
      .exec();
  }

  async listByUserId(
    userId: Types.ObjectId | string,
    options: { status?: string; jobId?: Types.ObjectId | string; page?: number; pageSize?: number } = {},
  ) {
    const { status, jobId, page = 1, pageSize = 20 } = options;
    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;
    if (jobId) filter.jobId = jobId;

    const limit = Math.min(pageSize, 100);
    const skip = (page - 1) * pageSize;
    const [applications, total] = await Promise.all([
      ApplicationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      ApplicationModel.countDocuments(filter).exec(),
    ]);
    return { applications: applications as unknown as LeanApplication[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async logEvent(data: ApplicationEventData): Promise<IApplicationEvent> {
    const event = new ApplicationEventModel(data);
    return event.save();
  }

  async listEvents(applicationId: Types.ObjectId | string, userId: Types.ObjectId | string) {
    return ApplicationEventModel.find({ applicationId, userId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }
}
