/** Job routes. */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import {
  createManualJobSchema,
  updateJobSchema,
  jobIdParamSchema,
  saveJobSchema,
  matchListQuerySchema,
  importMockJobsSchema,
  importFromSourceSchema,
  savedJobIdParamSchema,
} from '../schemas/job.js';
import { discoverySearchQuerySchema } from '../schemas/discovery.js';
import { getDiscoveryService } from '../jobs/discovery/index.js';
import {
  searchJobs,
  getJobById,
  createManualJob,
  saveJob,
  unsaveJob,
  importMockJobs,
  importFromSource,
  getSavedJobs,
  getJobWithSaveStatus,
  updateJob,
  deleteJob,
  importJobFromUrl,
} from '../services/JobService.js';
import { getPlatform, getCapability, CapabilityKey, PlatformDescriptor } from '../platforms/PlatformCapabilities.js';
import {
  matchJobForUser,
  listJobMatchesForUser,
} from '../services/JobMatchingService.js';
import { prioritizeJobsForUser } from '../services/JobPrioritizationService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimitJobIngestion } from '../middleware/rateLimiter.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Helper to get user ID as ObjectId
 */
function getUserId(req: AuthenticatedRequest): Types.ObjectId {
  return new Types.ObjectId(req.user!.sub);
}

/**
 * Helper to get string parameter from req.params
 */
function getParamId(params: Record<string, string | string[]>): string {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

/**
 * Throw a 404 for malformed MongoDB ObjectIds so callers get a
 * consistent error envelope instead of a 500 CastError.
 */
function assertValidObjectId(jobId: string): void {
  if (!Types.ObjectId.isValid(jobId)) {
    throw new NotFoundError('Job', jobId);
  }
}

/**
 * GET /api/jobs
 * List authenticated user's jobs with search and filters
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
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
  } = req.query;

  const result = await searchJobs(userId, {
    query: query as string,
    company: company as string,
    location: location as string,
    remoteType: remoteType as string,
    employmentType: employmentType as string,
    experienceLevel: experienceLevel as string,
    salaryMin: salaryMin ? parseInt(salaryMin as string) : undefined,
    salaryMax: salaryMax ? parseInt(salaryMax as string) : undefined,
    salaryCurrency: salaryCurrency as string,
    salaryPeriod: salaryPeriod as string,
    skills: skills ? (skills as string).split(',') : undefined,
    source: source as string,
    status: status as string,
    postedAfter: postedAfter ? new Date(postedAfter as string) : undefined,
    postedBefore: postedBefore ? new Date(postedBefore as string) : undefined,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
    sortBy: sortBy as any,
    sortOrder: sortOrder as any,
  });

  res.json({ success: true, data: result });
});

/**
 * GET /api/jobs/search
 * Live job discovery across configured, authorized public sources. Returns
 * actual fetched, deduplicated listings with honest per-source state, a
 * freshness filter, and "load more" pagination. Registers before /:id so
 * "search" is not treated as a job id.
 */
router.get('/search', validate(discoverySearchQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
  const q = req.query as {
    roles?: string;
    q?: string;
    location?: string;
    countryIso?: string;
    includeRemote?: 'true' | 'false';
    includeWorldwideRemote?: 'true' | 'false';
    freshness?: 'any' | 'last7' | 'last14' | 'last30';
    sort?: 'relevance' | 'newest';
    page?: number;
    pageSize?: number;
  };

  const rolesSource = q.roles ?? q.q;
  const roles = (rolesSource ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  if (roles.length === 0) {
    throw new ValidationError('Provide at least one role query (roles or q)');
  }

  const data = await getDiscoveryService().discover({
    roles,
    location: q.location,
    countryIso: q.countryIso,
    includeRemote: q.includeRemote === undefined ? true : q.includeRemote === 'true',
    includeWorldwideRemote: q.includeWorldwideRemote === undefined ? true : q.includeWorldwideRemote === 'true',
    freshness: q.freshness ?? 'any',
    sort: q.sort ?? 'relevance',
    page: q.page,
    pageSize: q.pageSize,
  });

  res.json({ success: true, data });
});

/**
 * POST /api/jobs/manual
 * Create a manual job entry
 */
router.post('/manual', validate(createManualJobSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const result = await createManualJob(new Types.ObjectId(req.user!.sub), req.body);

  if (result.isDuplicate) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE',
        message: 'A similar job already exists',
        details: { duplicateJobId: result.duplicateJobId },
      },
    });
  }

  res.status(201).json({ success: true, data: result.job });
});

/**
 * GET /api/jobs/saved
 * List user's saved jobs
 * NOTE: static routes must be registered before /:id so Express
 * does not capture e.g. "saved" as a job ID.
 */
router.get('/saved', async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

  const result = await getSavedJobs(new Types.ObjectId(req.user!.sub), page, pageSize);
  res.json({ success: true, data: result });
});

/**
 * GET /api/jobs/matches
 * Ranked job matches for the authenticated candidate's verified profile.
 * Static route: must stay above /:id so "matches" is not treated as a job ID.
 */
router.get('/matches', validate(matchListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const minScore = req.query.minScore !== undefined ? Number(req.query.minScore) : 0;
  const page = req.query.page !== undefined ? parseInt(req.query.page as string) : 1;
  const pageSize = req.query.pageSize !== undefined ? parseInt(req.query.pageSize as string) : 20;

  const result = await listJobMatchesForUser(userId, { minScore, page, pageSize });
  res.json({ success: true, data: result });
});

/**
 * GET /api/jobs/prioritized
 * Prioritized job list combining existing match scores with existing
 * job-specific profile readiness assessments. Matching and readiness
 * only; nothing is submitted.
 */
router.get('/prioritized', validate(matchListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const minScore = req.query.minScore !== undefined ? Number(req.query.minScore) : 0;
  const page = req.query.page !== undefined ? parseInt(req.query.page as string) : 1;
  const pageSize = req.query.pageSize !== undefined ? parseInt(req.query.pageSize as string) : 20;

  const result = await prioritizeJobsForUser(userId, { minScore, page, pageSize });
  res.json({ success: true, data: result });
});

/**
 * GET /api/jobs/:id
 * Get job metadata
 */
router.get('/:id', validate(jobIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const jobId = getParamId(req.params);
  
  // Validate that the ID is a valid ObjectId
  if (!Types.ObjectId.isValid(jobId)) {
    throw new NotFoundError('Job', jobId);
  }
  
  const job = await getJobById(jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  res.json({ success: true, data: job });
});

/**
 * GET /api/jobs/:id/status
 * Get job with save status for current user
 */
router.get('/:id/status', validate(jobIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub).toString();
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);

  const job = await getJobWithSaveStatus(userId, jobId);
  if (!job) {
    throw new NotFoundError('Job', jobId);
  }
  res.json({ success: true, data: job });
});

/**
 * GET /api/jobs/:id/match
 * Match a single owned job against the caller's verified profile,
 * with a structured explanation. Matching only; nothing is submitted.
 */
router.get('/:id/match', validate(jobIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);

  const result = await matchJobForUser(userId, jobId);
  res.json({ success: true, data: result });
});

/**
 * PATCH /api/jobs/:id
 * Update job (only permitted fields for manual jobs)
 */
router.patch('/:id', validate(updateJobSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);
  
  try {
    const updated = await updateJob(jobId, userId, req.body);
    if (!updated) {
      throw new NotFoundError('Job', jobId);
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw error;
  }
});

/**
 * DELETE /api/jobs/:id
 * Delete job (only for manual/user-created jobs)
 */
router.delete('/:id', validate(jobIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);
  
  try {
    const deleted = await deleteJob(jobId, userId);
    if (!deleted) {
      throw new NotFoundError('Job', jobId);
    }
    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw error;
  }
});

/**
 * POST /api/jobs/:id/save
 * Save a job for the current user
 */
router.post('/:id/save', validate(saveJobSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub).toString();
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);
  const { notes } = req.body;

  try {
    const result = await saveJob(userId, jobId, notes);
    if (result.isNew) {
      res.status(201).json({ success: true, data: result.savedJob, message: 'Job saved successfully' });
    } else {
      res.json({ success: true, data: result.savedJob, message: 'Job already saved' });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw error;
  }
});

/**
 * DELETE /api/jobs/:id/save
 * Unsave a job
 */
router.delete('/:id/save', validate(savedJobIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub).toString();
  const jobId = getParamId(req.params);
  assertValidObjectId(jobId);

  const unsaved = await unsaveJob(userId, jobId);
  if (!unsaved) {
    throw new NotFoundError('Saved job', jobId);
  }
  res.json({ success: true, message: 'Job unsaved successfully' });
});

/**
 * POST /api/jobs/import/mock
 * Import mock jobs for development
 */
router.post('/import/mock', rateLimitJobIngestion, validate(importMockJobsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const count = req.body.count || 10;
  const result = await importMockJobs(new Types.ObjectId(req.user!.sub), count);
  res.json({ success: true, data: result });
});

/**
 * POST /api/jobs/import/source
 * Import jobs from a source
 */
router.post('/import/source', rateLimitJobIngestion, validate(importFromSourceSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { source, ...criteria } = req.body;
  const result = await importFromSource(new Types.ObjectId(req.user!.sub), source, criteria);
  res.json({ success: true, data: result });
});

/**
 * POST /api/jobs/import/url
 * Import a job from a URL (e.g. Naukri job posting).
 * Since platform scraping is not authorized for Naukri, the candidate
 * manually supplies the job details after URL validation and capability check.
 */
router.post('/import/url', rateLimitJobIngestion, async (req: AuthenticatedRequest, res: Response) => {
  const userId = new Types.ObjectId(req.user!.sub);
  const { url, title, companyName, location, description, applicationUrl, remoteType, employmentType, experienceLevel } = req.body as {
    url: string;
    title?: string;
    companyName?: string;
    location?: string;
    description?: string;
    applicationUrl?: string;
    remoteType?: string;
    employmentType?: string;
    experienceLevel?: string;
  };

  // Validate the source URL
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL is required');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ValidationError('Invalid URL');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ValidationError('Only HTTP/HTTPS URLs are allowed');
  }

  // Identify platform from hostname
  const hostname = parsedUrl.hostname.toLowerCase();
  let platform = 'unknown';
  if (hostname.includes('naukri.com')) platform = 'naukri';
  else if (hostname.includes('linkedin.com')) platform = 'linkedin';
  else if (hostname.includes('indeed.com')) platform = 'indeed';
  else if (hostname.includes('apna.co')) platform = 'apna';
  else if (hostname.includes('wellfound.com')) platform = 'wellfound';
  else platform = 'career-site';

  // Check platform capabilities
  const platformCap = getPlatform(platform);
  const detailCap = getCapability(platform, 'detail');
  const discoveryCap = getCapability(platform, 'discovery');

  const scrapingAvailable = detailCap?.status === 'supported' || discoveryCap?.status === 'supported';

  // Build job data from manual input (scraping not available for Naukri)
  const jobData: {
    title: string;
    companyName: string;
    location?: string;
    description?: string;
    applicationUrl?: string;
    remoteType?: string;
    employmentType?: string;
    experienceLevel?: string;
    sources: Array<{ name: string; sourceJobId?: string; sourceUrl?: string; discoveredAt?: Date }>;
  } = {
    title: title || 'Imported Job',
    companyName: companyName || 'Unknown Company',
    location: location || undefined,
    description: description || undefined,
    applicationUrl: applicationUrl || url,
    remoteType: remoteType || undefined,
    employmentType: employmentType || undefined,
    experienceLevel: experienceLevel || undefined,
    sources: [
      {
        name: platform,
        sourceUrl: url,
        discoveredAt: new Date(),
      },
    ],
  };

  const result = await importJobFromUrl(userId, jobData, platform, scrapingAvailable);

  res.status(201).json({
    success: true,
    data: {
      ...result,
      platform,
      scrapingAvailable,
      capabilities: {
        detail: detailCap?.status,
        submission: getCapability(platform, 'submit')?.status,
        upload: getCapability(platform, 'upload')?.status,
        handoff: getCapability(platform, 'handoff')?.status,
        prepare: getCapability(platform, 'prepare')?.status,
      },
    },
  });
});

export default router;