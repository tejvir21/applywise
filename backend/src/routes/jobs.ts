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
} from '../services/JobService.js';
import {
  matchJobForUser,
  listJobMatchesForUser,
} from '../services/JobMatchingService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
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
router.post('/import/mock', validate(importMockJobsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const count = req.body.count || 10;
  const result = await importMockJobs(new Types.ObjectId(req.user!.sub), count);
  res.json({ success: true, data: result });
});

/**
 * POST /api/jobs/import/source
 * Import jobs from a source
 */
router.post('/import/source', validate(importFromSourceSchema), async (req: AuthenticatedRequest, res: Response) => {
  const { source, ...criteria } = req.body;
  const result = await importFromSource(new Types.ObjectId(req.user!.sub), source, criteria);
  res.json({ success: true, data: result });
});

export default router;