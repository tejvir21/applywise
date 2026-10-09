/** Job service: business logic for job management. */

import { Types } from 'mongoose';
import { JobModel, IJob, ISavedJob, RemoteType, EmploymentType, ExperienceLevel, SalaryPeriod, JobStatus } from '../models/Job.js';
import { jobSourceRegistry, mockJobSource, manualJobSource } from '../jobs/index.js';
import { JobRepository, SavedJobRepository, CreateJobData } from '../repositories/JobRepository.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import type { CreateManualJobInput } from '../schemas/job.js';

const jobRepository = new JobRepository();
const savedJobRepository = new SavedJobRepository();

export interface JobListItem {
  id: string;
  title: string;
  companyName: string;
  location?: string;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  experienceLevel: ExperienceLevel;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  postedAt?: Date;
  status: JobStatus;
  isSaved?: boolean;
  source?: string;
  createdAt: Date;
}

export interface JobDetail {
  id: string;
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
  requiredSkills: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  preferredSkills: Array<{ name: string; required: boolean; confidence?: string; source?: string }>;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  applicationUrl?: string;
  sources: Array<{ name: string; sourceJobId?: string; sourceUrl?: string; discoveredAt: Date }>;
  source: string;
  status: JobStatus;
  postedAt?: Date;
  discoveredAt: Date;
  expiresAt?: Date;
  isSaved?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchJobsResult {
  jobs: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateJobResult {
  job: JobDetail;
  isDuplicate: boolean;
  duplicateJobId?: string;
}

/**
 * Search jobs with filters
 */
export async function searchJobs(
  userId: Types.ObjectId,
  criteria: {
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
  }
): Promise<SearchJobsResult> {
  const result = await jobRepository.findAll(userId, criteria);
  
  const jobs: JobListItem[] = result.jobs.map((job: any) => ({
    id: job._id.toString(),
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    postedAt: job.postedAt,
    status: job.status,
    source: job.sources?.[0]?.name,
    createdAt: job.createdAt,
  }));

  return {
    jobs,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

/**
 * Get job by ID
 */
export async function getJobById(jobId: string): Promise<JobDetail | null> {
  const job = await jobRepository.findById(jobId);
  if (!job) return null;
  
  return mapJobToDetail(job);
}

/**
 * Create a manual job
 */
export async function createManualJob(
  userId: Types.ObjectId,
  data: CreateManualJobInput
): Promise<CreateJobResult> {
  // Normalize using manual job source
  const normalized = manualJobSource.normalizeJob(data);
  
  // Check for duplicate by source
  const existingBySource = await jobRepository.findBySource(normalized.sourceName, normalized.sourceJobId);
  if (existingBySource) {
    return {
      job: mapJobToDetail(existingBySource),
      isDuplicate: true,
      duplicateJobId: existingBySource._id.toString(),
    };
  }
  
  // Check for duplicate by normalized key
  const dedupKey = manualJobSource.generateDeduplicationKey(normalized);
  const existingByKey = await jobRepository.findByNormalizedKey(dedupKey);
  if (existingByKey) {
    return {
      job: mapJobToDetail(existingByKey),
      isDuplicate: true,
      duplicateJobId: existingByKey._id.toString(),
    };
  }
  
  // Create job with userId for ownership
  const createData: CreateJobData = {
    ...normalized,
    normalizedKey: dedupKey,
    status: 'active',
    userId: userId.toString(),
  };
  
  const job = await jobRepository.create(createData);
  
  return {
    job: mapJobToDetail(job),
    isDuplicate: false,
  };
}

/**
 * Get user's saved jobs with full details
 */
export async function getSavedJobs(
  userId: Types.ObjectId,
  page = 1,
  pageSize = 20
): Promise<{ savedJobs: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
  return savedJobRepository.getSavedJobsWithDetails(userId, page, pageSize);
}

/**
 * Save a job for the user
 */
export async function saveJob(userId: string, jobId: string, notes?: string): Promise<{ savedJob: any; isNew: boolean }> {
  const userObjectId = new Types.ObjectId(userId);
  const jobObjectId = new Types.ObjectId(jobId);
  
  // Check if job exists
  const job = await jobRepository.findById(jobObjectId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  
  // Check if already saved
  const alreadySaved = await savedJobRepository.isSaved(userObjectId, jobObjectId);
  if (alreadySaved) {
    const savedJob = await savedJobRepository.findByUserIdAndJobId(userObjectId, jobObjectId);
    return { savedJob, isNew: false };
  }
  
  // Save the job
  const savedJob = await savedJobRepository.save({
    userId: userObjectId,
    jobId: jobObjectId,
    notes,
  });
  
  return { savedJob, isNew: true };
}

/**
 * Unsave a job
 */
export async function unsaveJob(userId: string, jobId: string): Promise<boolean> {
  const userObjectId = new Types.ObjectId(userId);
  const jobObjectId = new Types.ObjectId(jobId);
  
  return savedJobRepository.unsave(userObjectId, jobObjectId);
}

/**
 * Import mock jobs for development
 */
export async function importMockJobs(
  userId: Types.ObjectId,
  count = 10
): Promise<{ imported: number; skipped: number; jobs: JobDetail[] }> {
  const criteria = { page: 1, pageSize: count };
  const result = await mockJobSource.searchJobs(criteria);
  
  let imported = 0;
  let skipped = 0;
  const importedJobs: JobDetail[] = [];
  
  for (const mockJob of result.jobs) {
    // Check if already exists
    const exists = await jobRepository.existsBySource(mockJob.sourceName, mockJob.sourceJobId);
    if (exists) {
      skipped++;
      continue;
    }
    
    // Create the job (global, not user-specific since jobs are shared)
    const createData: CreateJobData = {
      ...mockJob,
      sources: [
        {
          name: mockJob.sourceName,
          sourceJobId: mockJob.sourceJobId,
          sourceUrl: mockJob.sourceUrl,
          discoveredAt: mockJob.postedAt,
        },
      ],
      normalizedKey: mockJobSource.generateDeduplicationKey(mockJob),
      status: 'active',
      userId: userId.toString(),
    };
    
    const job = await jobRepository.create(createData);
    importedJobs.push(mapJobToDetail(job));
    imported++;
  }
  
  return { imported, skipped, jobs: importedJobs };
}

/**
 * Import jobs from a source
 */
export async function importFromSource(
  userId: Types.ObjectId,
  sourceName: string,
  criteria: {
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
    postedAfter?: Date;
    postedBefore?: Date;
    page?: number;
    pageSize?: number;
  }
): Promise<{ imported: number; skipped: number; jobs: JobDetail[] }> {
  const adapter = jobSourceRegistry.get(sourceName);
  if (!adapter) {
    throw new ValidationError(`Unknown job source: ${sourceName}`);
  }
  
  if (adapter.requiresAuth) {
    const configured = await adapter.validateConfiguration();
    if (!configured) {
      throw new ValidationError(`Job source ${sourceName} is not configured`);
    }
  }
  
  const searchCriteria = {
    ...criteria,
    remoteType: criteria.remoteType as 'remote' | 'hybrid' | 'onsite' | 'flexible' | undefined,
    employmentType: criteria.employmentType as 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance' | undefined,
    experienceLevel: criteria.experienceLevel as 'internship' | 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | undefined,
    salaryPeriod: criteria.salaryPeriod as 'hourly' | 'monthly' | 'yearly' | undefined,
    page: criteria.page ?? 1,
    pageSize: criteria.pageSize ?? 20,
  };
  
  const result = await adapter.searchJobs(searchCriteria);
  
  let imported = 0;
  let skipped = 0;
  const importedJobs: JobDetail[] = [];
  
  for (const normalizedJob of result.jobs) {
    // Check if already exists
    const exists = await jobRepository.existsBySource(normalizedJob.sourceName, normalizedJob.sourceJobId);
    if (exists) {
      skipped++;
      continue;
    }
    
    // Create the job (with a sources entry so detail/source-filtering and
    // existsBySource dedupe behave exactly like importMockJobs)
    const createData: CreateJobData = {
      ...normalizedJob,
      sources: normalizedJob.sources ?? [
        {
          name: normalizedJob.sourceName,
          sourceJobId: normalizedJob.sourceJobId,
          sourceUrl: normalizedJob.sourceUrl,
          discoveredAt: normalizedJob.postedAt,
        },
      ],
      normalizedKey: adapter.generateDeduplicationKey(normalizedJob),
      status: 'active',
      userId: userId.toString(),
    };
    
    const job = await jobRepository.create(createData);
    importedJobs.push(mapJobToDetail(job));
    imported++;
  }
  
  return { imported, skipped, jobs: importedJobs };
}

/**
 * Get job with save status for a specific user
 */
export async function getJobWithSaveStatus(userId: string, jobId: string): Promise<JobDetail | null> {
  const job = await getJobById(jobId);
  if (!job) return null;
  
  const isSaved = await savedJobRepository.isJobSaved(new Types.ObjectId(userId), new Types.ObjectId(jobId));
  
  return { ...job, isSaved };
}

/**
 * Update a job (only for manual/user-created jobs)
 */
export async function updateJob(
  jobId: string,
  userId: Types.ObjectId,
  data: Partial<CreateJobData>
): Promise<JobDetail | null> {
  // Only allow updating jobs created by this user (manual entries)
  const job = await jobRepository.findByIdAndUserId(jobId, userId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  
  // Check if it's a manual job (user-created)
  const isManual = job.sources?.some((s: any) => s.name === 'manual') ?? false;
  if (!isManual) {
    throw new ValidationError('Cannot update externally sourced jobs');
  }
  
  const updated = await jobRepository.update(jobId, userId, data as any);
  if (!updated) return null;
  
  return mapJobToDetail(updated);
}

/**
 * Delete a job (soft delete - only for manual/user-created jobs)
 */
export async function deleteJob(jobId: string, userId: Types.ObjectId): Promise<boolean> {
  // Only allow deleting jobs created by this user (manual entries)
  const job = await jobRepository.findByIdAndUserId(jobId, userId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  
  // Check if it's a manual job (user-created)
  const isManual = job.sources?.some((s: any) => s.name === 'manual') ?? false;
  if (!isManual) {
    throw new ValidationError('Cannot delete externally sourced jobs');
  }
  
  return jobRepository.delete(jobId, userId);
}

/**
 * Map job document to detail response
 */
function mapJobToDetail(job: any): JobDetail {
  return {
    id: job._id.toString(),
    title: job.title,
    companyName: job.companyName,
    companyWebsite: job.companyWebsite,
    location: job.location,
    city: job.city,
    state: job.state,
    country: job.country,
    remoteType: job.remoteType,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    description: job.description,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    applicationUrl: job.applicationUrl,
    sources: job.sources?.map((s: any) => ({
      name: s.name,
      sourceJobId: s.sourceJobId,
      sourceUrl: s.sourceUrl,
      discoveredAt: s.discoveredAt,
    })) ?? [],
    source: job.sources[0]?.name ?? 'manual',
    status: job.status,
    postedAt: job.postedAt,
    discoveredAt: job.discoveredAt,
    expiresAt: job.expiresAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}