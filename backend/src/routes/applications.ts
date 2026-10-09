/** Application routes (Phase 6: management + approval, no submission). */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import {
  createApplicationSchema,
  updateDraftSchema,
  requestReviewSchema,
  decideApplicationSchema,
  listApplicationsQuerySchema,
  applicationIdParamSchema,
  generateMaterialsSchema,
  generateAnswerSchema,
  updateMaterialsSchema,
} from '../schemas/application.js';
import {
  createApplication,
  getApplication,
  updateDraft,
  requestReview,
  decideApplication,
  cancelApplication,
  listApplications,
  getAuditHistory,
} from '../services/ApplicationService.js';
import {
  evaluateApplicationPolicy,
  requestHandoff,
} from '../services/PlatformService.js';
import {
  generateCoverLetter,
  generateResumeDraft,
  generateAnswer,
  updateMaterials,
  markMaterialsReviewed,
  getMaterials,
} from '../services/MaterialGenerationService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
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

function assertValidObjectId(value: string, resource = 'Application'): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new NotFoundError(resource, value);
  }
}

/**
 * GET /api/applications
 * List the caller's applications with status/job filters and pagination.
 */
router.get('/', validate(listApplicationsQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
  const { status, jobId, page = 1, pageSize = 20 } = req.query;
  const result = await listApplications(getUserId(req), {
    status: status as string | undefined,
    jobId: jobId as string | undefined,
    page: parseInt(page as string),
    pageSize: parseInt(pageSize as string),
  });
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications
 * Create a draft application for an owned job. One live application per job.
 */
router.post('/', validate(createApplicationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await createApplication(getUserId(req), req.body);
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/applications/:id
 * Retrieve one owned application.
 */
router.get('/:id', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await getApplication(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

/**
 * GET /api/applications/:id/events
 * Audit history for one owned application.
 */
router.get('/:id/events', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const events = await getAuditHistory(getUserId(req), applicationId);
  res.json({ success: true, data: { events } });
});

/**
 * PATCH /api/applications/:id
 * Update permitted draft fields (DRAFT status only).
 */
router.patch('/:id', validate(updateDraftSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await updateDraft(getUserId(req), applicationId, req.body);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/request-review
 * Move a DRAFT to READY_FOR_REVIEW (auto mode) or AWAITING_APPROVAL
 * (permission mode). Requires a selected resume and confirmation of any
 * unverified answers.
 */
router.post('/:id/request-review', validate(requestReviewSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await requestReview(getUserId(req), applicationId, req.body.confirmUnverified ?? false);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/approve
 * Approve (READY_FOR_REVIEW/AWAITING_APPROVAL -> APPROVED) or reject
 * (-> CANCELLED). Approval records a decision only; nothing is submitted.
 */
router.post('/:id/approve', validate(decideApplicationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await decideApplication(
    getUserId(req),
    applicationId,
    req.body.decision,
    req.body.note,
    req.body.confirmUnverified ?? false,
  );
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/cancel
 * Cancel when the current state permits it.
 */
router.post('/:id/cancel', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await cancelApplication(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/policy
 * Evaluate the authorization-aware submission policy for a platform.
 * Decides only; performs no submission and changes no state.
 */
router.post('/:id/policy', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const platform = typeof req.body?.platform === 'string' ? req.body.platform : '';
  if (!platform) {
    throw new ValidationError('A platform is required', { platform });
  }
  const result = await evaluateApplicationPolicy(getUserId(req), applicationId, platform);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/handoff
 * Safe user handoff for APPROVED applications: records the handoff, moves to
 * NEEDS_MANUAL_ACTION, and returns the platform URL plus instructions.
 * Opening the page never marks anything submitted.
 */
router.post('/:id/handoff', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await requestHandoff(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

/**
 * GET /api/applications/:id/materials
 * Saved draft materials with provenance and review state. Never submits.
 */
router.get('/:id/materials', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await getMaterials(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/materials/cover-letter
 * Generate a cover-letter draft from verified data (DRAFT only).
 */
router.post('/:id/materials/cover-letter', validate(generateMaterialsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await generateCoverLetter(getUserId(req), applicationId, { replace: req.body.replace ?? false });
  res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/materials/resume
 * Generate a tailored resume draft (DRAFT only). The original resume is untouched.
 */
router.post('/:id/materials/resume', validate(generateMaterialsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await generateResumeDraft(getUserId(req), applicationId, { replace: req.body.replace ?? false });
  res.status(201).json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/materials/answers
 * Generate or revise an answer draft (DRAFT only). Generated answers always
 * enter unverified so the confirmation flow must clear them.
 */
router.post('/:id/materials/answers', validate(generateAnswerSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  const result = await generateAnswer(getUserId(req), applicationId, req.body.question, { replace: req.body.replace ?? false });
  res.status(201).json({ success: true, data: result });
});

/**
 * PATCH /api/applications/:id/materials
 * Candidate edits to draft materials (DRAFT only). User edits are preserved:
 * regeneration without replace:true is rejected rather than overwriting.
 */
router.patch('/:id/materials', validate(updateMaterialsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  await updateMaterials(getUserId(req), applicationId, req.body);
  const result = await getMaterials(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

/**
 * POST /api/applications/:id/materials/review
 * Mark materials as reviewed. Review only: changes no status and approves nothing.
 */
router.post('/:id/materials/review', validate(applicationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const applicationId = getParamId(req.params);
  assertValidObjectId(applicationId);
  await markMaterialsReviewed(getUserId(req), applicationId);
  const result = await getMaterials(getUserId(req), applicationId);
  res.json({ success: true, data: result });
});

export default router;
