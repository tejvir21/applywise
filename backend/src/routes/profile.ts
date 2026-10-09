/** Candidate Profile routes. */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  createProfileSchema,
  updateProfileSchema,
  updatePreferencesSchema,
  addSkillSchema,
  addExperienceSchema,
  addEducationSchema,
  addProjectSchema,
  addCertificationSchema,
  skillIdParamSchema,
  experienceIdParamSchema,
  educationIdParamSchema,
  projectIdParamSchema,
  certificationIdParamSchema,
} from '../schemas/profile.js';
import {
  createProfile,
  getProfile,
  getProfileOrThrow,
  updateProfile,
  deleteProfile,
  getPreferences,
  updatePreferences,
  addSkill,
  removeSkill,
  addExperience,
  removeExperience,
  addEducation,
  removeEducation,
  addProject,
  removeProject,
  addCertification,
  removeCertification,
  getProfileCompletion,
} from '../services/CandidateProfileService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Helper to convert string param to ObjectId
 */
function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid ID format');
  }
  return new Types.ObjectId(id);
}

/**
 * Helper to convert string param to ObjectId and return as string for service functions
 */
function toObjectIdString(id: string | string[]): string {
  const idStr = Array.isArray(id) ? id[0] : id;
  if (!Types.ObjectId.isValid(idStr)) {
    throw new ValidationError('Invalid ID format');
  }
  return new Types.ObjectId(idStr).toString();
}

/**
 * Helper to get user ID as ObjectId from JWT token
 */
function getUserId(req: AuthenticatedRequest): Types.ObjectId {
  return toObjectId(req.user!.sub);
}

/**
 * GET /api/profile
 * Get the authenticated user's profile
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const profile = await getProfile(userId);
  if (!profile) {
    throw new NotFoundError('Profile', userId.toString());
  }
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile
 * Create the authenticated user's profile
 */
router.post('/', validate(createProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await createProfile(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * PUT /api/profile
 * Update the authenticated user's profile (full update)
 */
router.put('/', validate(updateProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await updateProfile(getUserId(req), req.body);
  res.json({ success: true, data: profile });
});

/**
 * PATCH /api/profile
 * Partially update the authenticated user's profile
 */
router.patch('/', validate(updateProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await updateProfile(getUserId(req), req.body);
  res.json({ success: true, data: profile });
});

/**
 * DELETE /api/profile
 * Delete the authenticated user's profile
 */
router.delete('/', async (req: AuthenticatedRequest, res: Response) => {
  await deleteProfile(getUserId(req));
  res.json({ success: true, data: { message: 'Profile deleted successfully' } });
});

/**
 * GET /api/profile/completion
 * Get profile completion percentage and details
 */
router.get('/completion', async (req: AuthenticatedRequest, res: Response) => {
  const completion = await getProfileCompletion(getUserId(req));
  res.json({ success: true, data: completion });
});

/**
 * GET /api/profile/preferences
 * Get job preferences
 */
router.get('/preferences', async (req: AuthenticatedRequest, res: Response) => {
  const preferences = await getPreferences(getUserId(req));
  res.json({ success: true, data: preferences ?? {} });
});

/**
 * PUT /api/profile/preferences
 * Update job preferences
 */
router.put('/preferences', validate(updatePreferencesSchema), async (req: AuthenticatedRequest, res: Response) => {
  const preferences = await updatePreferences(getUserId(req), req.body);
  res.json({ success: true, data: preferences });
});

/**
 * PATCH /api/profile/preferences
 * Partially update job preferences
 */
router.patch('/preferences', validate(updatePreferencesSchema), async (req: AuthenticatedRequest, res: Response) => {
  const preferences = await updatePreferences(getUserId(req), req.body);
  res.json({ success: true, data: preferences });
});

/**
 * POST /api/profile/skills
 * Add a skill
 */
router.post('/skills', validate(addSkillSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await addSkill(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * DELETE /api/profile/skills/:skillId
 * Remove a skill
 */
router.delete('/skills/:skillId', validate(skillIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await removeSkill(getUserId(req), toObjectIdString(req.params.skillId));
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile/experience
 * Add experience
 */
router.post('/experience', validate(addExperienceSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await addExperience(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * DELETE /api/profile/experience/:experienceId
 * Remove experience
 */
router.delete('/experience/:experienceId', validate(experienceIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await removeExperience(getUserId(req), toObjectIdString(req.params.experienceId));
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile/education
 * Add education
 */
router.post('/education', validate(addEducationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await addEducation(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * DELETE /api/profile/education/:educationId
 * Remove education
 */
router.delete('/education/:educationId', validate(educationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await removeEducation(getUserId(req), toObjectIdString(req.params.educationId));
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile/projects
 * Add project
 */
router.post('/projects', validate(addProjectSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await addProject(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * DELETE /api/profile/projects/:projectId
 * Remove project
 */
router.delete('/projects/:projectId', validate(projectIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await removeProject(getUserId(req), toObjectIdString(req.params.projectId));
  res.json({ success: true, data: profile });
});

/**
 * POST /api/profile/certifications
 * Add certification
 */
router.post('/certifications', validate(addCertificationSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await addCertification(getUserId(req), req.body);
  res.status(201).json({ success: true, data: profile });
});

/**
 * DELETE /api/profile/certifications/:certificationId
 * Remove certification
 */
router.delete('/certifications/:certificationId', validate(certificationIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const profile = await removeCertification(getUserId(req), toObjectIdString(req.params.certificationId));
  res.json({ success: true, data: profile });
});

export default router;