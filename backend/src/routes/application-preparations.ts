/** Application preparation routes (Phase 8.3.13).
 *
 * Candidate-owned preparation workflow: tailor a resume, write a cover
 * letter, prepare answers to application questions, review, and save as a
 * draft. Nothing here submits an application.
 */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import {
  createPreparationSchema,
  updatePreparationSchema,
  tailorResumeSchema,
  coverLetterSchema,
  prepareAnswersSchema,
  updateAnswerSchema,
  reviewPreparationSchema,
  savePreparationSchema,
  preparationIdParamSchema,
} from '../schemas/application-preparation.js';
import {
  startPreparation,
  generateTailoredResume,
  generateCoverLetter,
  generateAnswers,
  updateAnswer,
  reviewPreparation,
  savePreparation,
  getPreparation,
  listPreparations,
  cancelPreparation,
  reopenPreparation,
} from '../services/ApplicationPreparationService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimitAiGeneration } from '../middleware/rateLimiter.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// All routes require authentication; identity always comes from the token.
router.use(authMiddleware);

function getUserId(req: AuthenticatedRequest): Types.ObjectId {
  return new Types.ObjectId(req.user!.sub);
}

function getParamId(params: Record<string, string | string[]>): string {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

function assertValidObjectId(value: string, resource = 'ApplicationPreparation'): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new NotFoundError(resource, value);
  }
}

/**
 * POST /api/application-preparations
 * Start preparation for a job. Returns existing preparation if one is active.
 */
router.post(
  '/',
  validate(createPreparationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const { jobId, resumeId } = req.body as {
      jobId: string;
      resumeId?: string;
    };
    const result = await startPreparation(userId, jobId, resumeId);
    res.status(201).json({ success: true, data: result });
  },
);

/**
 * GET /api/application-preparations
 * List the candidate's preparations.
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    if (isNaN(page) || page < 1) {
      throw new ValidationError('Invalid page parameter');
    }
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ValidationError('Invalid pageSize parameter');
    }
    const status = req.query.status as
      | 'DRAFT'
      | 'IN_PROGRESS'
      | 'READY_FOR_REVIEW'
      | 'APPROVED'
      | 'REJECTED'
      | 'CANCELLED'
      | undefined;
    if (status && !['DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
      throw new ValidationError('Invalid status parameter');
    }
    const query = req.query.query as string | undefined;
    const result = await listPreparations(userId, { status, page, pageSize, query });
    res.json({ success: true, data: result });
  },
);

/**
 * GET /api/application-preparations/:id
 * Get preparation details.
 */
router.get(
  '/:id',
  validate(preparationIdParamSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const preparation = await getPreparation(userId, preparationId);
    res.json({ success: true, data: preparation });
  },
);

/**
 * PATCH /api/application-preparations/:id
 * Update editable preparation data (missing information, etc.).
 */
router.patch(
  '/:id',
  validate(preparationIdParamSchema),
  validate(updatePreparationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const { missingInformation } = req.body as { missingInformation?: string[] };
    const result = await savePreparation(userId, preparationId, { missingInformation });
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/tailor-resume
 * Generate a tailored resume.
 */
router.post(
  '/:id/tailor-resume',
  rateLimitAiGeneration,
  validate(preparationIdParamSchema),
  validate(tailorResumeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const { replace } = req.body as { replace?: boolean };
    const result = await generateTailoredResume(userId, preparationId, { replace });
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/cover-letter
 * Generate a cover letter.
 */
router.post(
  '/:id/cover-letter',
  rateLimitAiGeneration,
  validate(preparationIdParamSchema),
  validate(coverLetterSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const { replace } = req.body as { replace?: boolean };
    const result = await generateCoverLetter(userId, preparationId, { replace });
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/answers
 * Generate answers for supplied questions.
 */
router.post(
  '/:id/answers',
  rateLimitAiGeneration,
  validate(preparationIdParamSchema),
  validate(prepareAnswersSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const { questions } = req.body as { questions: string[] };
    const result = await generateAnswers(userId, preparationId, questions);
    res.json({ success: true, data: result });
  },
);

/**
 * PATCH /api/application-preparations/:id/answers/:answerId
 * Edit an individual answer.
 */
router.patch(
  '/:id/answers/:answerId',
  validate(preparationIdParamSchema),
  validate(updateAnswerSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    const answerIdParam = req.params.answerId;
    const answerId = Array.isArray(answerIdParam) ? answerIdParam[0] : answerIdParam;
    assertValidObjectId(preparationId);
    assertValidObjectId(answerId, 'Answer');
    const result = await updateAnswer(userId, preparationId, answerId, req.body as {
      answer?: string;
      verified?: boolean;
      reviewStatus?: 'GENERATED' | 'NEEDS_CANDIDATE_INPUT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';
      reviewerNote?: string;
    });
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/review
 * Approve or reject a component or the whole package.
 */
router.post(
  '/:id/review',
  validate(preparationIdParamSchema),
  validate(reviewPreparationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const result = await reviewPreparation(userId, preparationId, req.body as {
      component?: 'tailoredResume' | 'coverLetter' | 'answers' | 'package';
      answerId?: string;
      decision?: 'approve' | 'reject';
      note?: string;
    });
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/save
 * Save draft / resume editing.
 */
router.post(
  '/:id/save',
  validate(preparationIdParamSchema),
  validate(savePreparationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const result = await savePreparation(userId, preparationId, {});
    res.json({ success: true, data: result });
  },
);

/**
 * DELETE /api/application-preparations/:id
 * Cancel a preparation.
 */
router.delete(
  '/:id',
  validate(preparationIdParamSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const result = await cancelPreparation(userId, preparationId);
    res.json({ success: true, data: result });
  },
);

/**
 * POST /api/application-preparations/:id/reopen
 * Reopen a rejected or approved preparation for continued editing.
 */
router.post(
  '/:id/reopen',
  validate(preparationIdParamSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = getUserId(req);
    const preparationId = getParamId(req.params);
    assertValidObjectId(preparationId);
    const result = await reopenPreparation(userId, preparationId);
    res.json({ success: true, data: result });
  },
);

export default router;
