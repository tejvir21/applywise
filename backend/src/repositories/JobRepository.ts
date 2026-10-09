/** Job repository for database operations. */

import { Types } from 'mongoose';
import { JobModel, IJob, JobStatus, ISavedJob, SavedJobModel } from '../models/Job.js';
import { NormalizedJob } from '../jobs/JobSourceAdapter.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export interface CreateJobData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType: string;
  employmentType: string;
  experienceLevel: string;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  requiredSkills?: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  preferredSkills?: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: string;
  applicationUrl?: string;
  sources?: Array<{ name: string; sourceJobId?: string; sourceUrl?: string; discoveredAt?: Date }>;
  normalizedKey?: string;
  status?: string;
  postedAt?: Date;
  discoveredAt?: Date;
  expiresAt?: Date;
  userId?: string;
}

export interface UpdateJobData {
  title?: string;
  companyName?: string;
  companyWebsite?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType?: string;
  employmentType?: string;
  experienceLevel?: string;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
  requiredSkills?: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  preferredSkills?: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  applicationUrl?: string;
  status?: string;
  postedAt?: Date;
  expiresAt?: Date;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  _id?: string;
}

export class JobRepository {
  /**
   * Find job by ID and user ID (for ownership checks)
   */
  async findByIdAndUserId(jobId: Types.ObjectId | string, userId: Types.ObjectId | string) {
    return JobModel.findOne({ _id: jobId, userId }).lean().exec();
  }

  /**
   * Find job by ID (global lookup - for shared jobs)
   */
  async findById(jobId: Types.ObjectId | string) {
    return JobModel.findById(jobId).lean().exec();
  }

  /**
   * Find job by ID or throw
   */
  async findByIdOrThrow(jobId: Types.ObjectId | string) {
    const job = await JobModel.findById(jobId).lean().exec();
    if (!job) {
      throw new NotFoundError('Job', jobId.toString());
    }
    return job;
  }

  /**
   * Find job by normalized key
   */
  async findByNormalizedKey(normalizedKey: string) {
    return JobModel.findOne({ normalizedKey }).lean().exec();
  }

  /**
   * Find job by source
   */
  async findBySource(sourceName: string, sourceJobId: string) {
    return JobModel.findOne({
      'sources.name': sourceName,
      'sources.sourceJobId': sourceJobId,
    }).lean().exec();
  }

  /**
   * Create a new job
   */
  async create(data: CreateJobData) {
    const job = new JobModel(data);
    return job.save();
  }

  /**
   * Update job by ID
   */
  async update(jobId: Types.ObjectId | string, userId: Types.ObjectId | string, data: UpdateJobData) {
    const { userId: _userId, createdAt, updatedAt, _id, ...updateData } = data;
    return JobModel.findOneAndUpdate(
      { _id: jobId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Update job by ID (global - for shared jobs)
   */
  async updateGlobal(jobId: Types.ObjectId | string, data: UpdateJobData) {
    const { createdAt, updatedAt, _id, ...updateData } = data;
    return JobModel.findByIdAndUpdate(
      jobId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean().exec();
  }

  /**
   * Delete job (soft delete by marking status)
   */
  async delete(jobId: Types.ObjectId | string, userId: Types.ObjectId | string) {
    const result = await JobModel.findOneAndUpdate(
      { _id: jobId, userId },
      { $set: { status: 'deleted' } }
    ).exec();
    return !!result;
  }

  /**
   * List jobs with filtering and pagination
   */
  async findAll(userId: Types.ObjectId | string, criteria: {
    query?: string;
    company?: string;
    location?: string;
    remoteType?: string;
    employmentType?: string;
    experienceLevel?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
    skills?: string[];
    source?: string;
    status?: string;
    postedAfter?: Date;
    postedBefore?: Date;
    page?: number;
    pageSize?: number;
    sortBy?: 'relevance' | 'postedAt' | 'discoveredAt' | 'salary';
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      query,
      company,
      location,
      remoteType,
      employmentType,
      experienceLevel,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      skills,
      source,
      status = 'active',
      postedAfter,
      postedBefore,
      page = 1,
      pageSize = 20,
      sortBy = 'discoveredAt',
      sortOrder = 'desc',
    } = criteria;

    const filter: Record<string, unknown> = {
      userId,
      status: { $ne: 'deleted' },
    };

    // Only filter by status if explicitly provided and not 'active'
    if (status !== 'active') {
      filter.status = status;
    }

    // Text search across title, company, description
    if (query) {
      filter.$or = [
        { title: { $regex: query, $options: 'i' } },
        { companyName: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ];
    }

    if (company) {
      filter.companyName = { $regex: company, $options: 'i' };
    }

    if (location) {
      filter.$or = [
        { location: { $regex: location, $options: 'i' } },
        { city: { $regex: location, $options: 'i' } },
        { state: { $regex: location, $options: 'i' } },
        { country: { $regex: location, $options: 'i' } },
      ];
    }

    if (remoteType) {
      filter.remoteType = remoteType;
    }

    if (employmentType) {
      filter.employmentType = employmentType;
    }

    if (experienceLevel) {
      filter.experienceLevel = experienceLevel;
    }

    if (salaryMin != null || salaryMax != null) {
      const salaryFilter: Record<string, number> = {};
      if (salaryMin != null) salaryFilter.$gte = salaryMin;
      if (salaryMax != null) salaryFilter.$lte = salaryMax;
      filter.$or = [
        { salaryMin: salaryFilter },
        { salaryMax: salaryFilter },
      ];
    }

    if (salaryCurrency) {
      filter.salaryCurrency = salaryCurrency.toUpperCase();
    }

    if (salaryPeriod) {
      filter.salaryPeriod = salaryPeriod;
    }

    if (source) {
      filter['sources.name'] = source;
    }

    if (postedAfter || postedBefore) {
      const postedFilter: Record<string, Date> = {};
      if (postedAfter) postedFilter.$gte = postedAfter;
      if (postedBefore) postedFilter.$lte = postedBefore;
      filter.postedAt = postedFilter;
    }

    // Build sort
    const sortField = ['relevance', 'postedAt', 'discoveredAt', 'salary'].includes(sortBy) ? sortBy : 'discoveredAt';
    const sortOrderValue = sortOrder === 'asc' ? 1 : -1;
    let sort: Record<string, 1 | -1> = { [sortBy === 'salary' ? 'salaryMax' : sortBy]: sortOrderValue };
    if (sortBy === 'salary') {
      sort = { salaryMax: sortOrderValue };
    }

    const skip = (page - 1) * pageSize;
    const limit = Math.min(pageSize, 100);

    const [jobs, total] = await Promise.all([
      JobModel.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      JobModel.countDocuments(filter).exec(),
    ]);

    return {
      jobs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Count jobs by user
   */
  async countByUserId(userId: Types.ObjectId | string) {
    return JobModel.countDocuments({ userId, status: { $ne: 'deleted' } }).exec();
  }

  /**
   * Check if job exists by source
   */
  async existsBySource(sourceName: string, sourceJobId: string): Promise<boolean> {
    const count = await JobModel.countDocuments({
      'sources.name': sourceName,
      'sources.sourceJobId': sourceJobId,
    }).exec();
    return count > 0;
  }
}

export interface SavedJobData {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  notes?: string;
}

export class SavedJobRepository {
  /**
   * Save a job for a user
   */
  async save(data: SavedJobData) {
    const savedJob = new SavedJobModel(data);
    return savedJob.save();
  }

  /**
   * Unsave a job for a user
   */
  async unsave(userId: Types.ObjectId | string, jobId: Types.ObjectId | string) {
    const result = await SavedJobModel.deleteOne({ userId, jobId }).exec();
    return result.deletedCount > 0;
  }

  /**
   * Check if job is saved by user
   */
  async isSaved(userId: Types.ObjectId | string, jobId: Types.ObjectId | string) {
    const count = await SavedJobModel.countDocuments({ userId, jobId }).exec();
    return count > 0;
  }

  /**
   * List user's saved jobs
   */
  async findByUserId(userId: Types.ObjectId | string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const limit = Math.min(pageSize, 100);

    const [savedJobs, total] = await Promise.all([
      SavedJobModel.find({ userId })
        .sort({ savedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(limit)
        .lean()
        .exec(),
      SavedJobModel.countDocuments({ userId }).exec(),
    ]);

    return {
      savedJobs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get saved job with job details
   */
  async findByUserIdAndJobId(userId: Types.ObjectId | string, jobId: Types.ObjectId | string) {
    return SavedJobModel.findOne({ userId, jobId }).lean().exec();
  }

  /**
   * Check if job is saved by user
   */
  async isJobSaved(userId: Types.ObjectId | string, jobId: Types.ObjectId | string) {
    const count = await SavedJobModel.countDocuments({ userId, jobId }).exec();
    return count > 0;
  }

  /**
   * Get saved job with populated job data
   */
  async getSavedJobsWithDetails(userId: Types.ObjectId | string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const limit = Math.min(pageSize, 100);

    const [savedJobs, total] = await Promise.all([
      SavedJobModel.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        { $sort: { savedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobId',
            foreignField: '_id',
            as: 'job',
          },
        },
        { $unwind: '$job' },
        { $match: { 'job.status': { $ne: 'deleted' } } },
        {
          $project: {
            savedAt: 1,
            notes: 1,
            job: {
              _id: 1,
              title: 1,
              companyName: 1,
              location: 1,
              remoteType: 1,
              employmentType: 1,
              experienceLevel: 1,
              salaryMin: 1,
              salaryMax: 1,
              salaryCurrency: 1,
              salaryPeriod: 1,
              postedAt: 1,
              status: 1,
              applicationUrl: 1,
              city: 1,
              state: 1,
              country: 1,
            },
          },
        },
      ]).exec(),
      SavedJobModel.countDocuments({ userId }).exec(),
    ]);

    return {
      savedJobs,
      total,
      page: 1,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}