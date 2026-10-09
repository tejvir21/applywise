/** Platform capability + submission settings routes (Phase 8). */

import { Router, Response } from 'express';
import {
  updateSubmissionSettingsSchema,
  platformParamSchema,
} from '../schemas/platform.js';
import { PLATFORMS, getPlatform } from '../platforms/PlatformCapabilities.js';
import {
  getSubmissionSettings,
  updateSubmissionSettings,
} from '../services/PlatformService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';
import { Types } from 'mongoose';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/platforms
 * Researched capability matrix for every tracked platform.
 */
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: { platforms: PLATFORMS } });
});

/**
 * GET /api/platforms/:platform
 * One platform descriptor, or 404 for unknown platforms.
 */
router.get('/:platform', validate(platformParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const name = Array.isArray(req.params.platform) ? req.params.platform[0] : req.params.platform;
  const descriptor = getPlatform(name);
  if (!descriptor) {
    throw new NotFoundError('Platform', name);
  }
  res.json({ success: true, data: descriptor });
});

/**
 * GET /api/platforms/settings/submission
 * The caller's submission settings (defaults when never saved).
 */
router.get('/settings/submission', async (req: AuthenticatedRequest, res: Response) => {
  const result = await getSubmissionSettings(new Types.ObjectId(req.user!.sub));
  res.json({ success: true, data: result });
});

/**
 * PUT /api/platforms/settings/submission
 * Replace submission settings (validated; user-scoped singleton).
 */
router.put('/settings/submission', validate(updateSubmissionSettingsSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await updateSubmissionSettings(new Types.ObjectId(req.user!.sub), req.body);
  res.json({ success: true, data: result });
});

export default router;
