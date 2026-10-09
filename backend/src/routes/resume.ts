/** Resume routes. */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import multer, { MulterError } from 'multer';
import { getConfig } from '../config/index.js';
import {
  setDefaultResumeSchema,
  analyzeResumeSchema,
  resumeIdParamSchema,
  importToProfileSchema,
} from '../schemas/resume.js';
import {
  uploadResume,
  listResumes,
  getResume,
  downloadResume,
  deleteResume,
  setDefaultResume,
  analyzeResume,
  getAnalysis,
  retryAnalysis,
  importToProfile,
} from '../services/ResumeService.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';

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
 * POST /api/resumes
 * Upload a resume file (PDF or DOCX, up to the configured size limit).
 * Files land in memory first, are content-validated by the service, then
 * persisted through the configured storage provider. Auth runs before any
 * bytes are parsed, so anonymous uploads are rejected with 401.
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const maxBytes = getConfig().MAX_RESUME_SIZE_MB * 1024 * 1024;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const name = file.originalname ?? '';
      const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
      const allowedNames = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!['.pdf', '.docx'].includes(extension) || !allowedNames.includes(file.mimetype)) {
        cb(new ValidationError('File type not allowed. Supported: PDF (.pdf), DOCX (.docx)'));
        return;
      }
      cb(null, true);
    },
  }).single('file');

  await new Promise<void>((resolve, reject) => {
    upload(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        throw new AppError('PAYLOAD_TOO_LARGE', `File size exceeds ${maxBytes / 1024 / 1024}MB limit`, 413);
      }
      throw new ValidationError(`Upload failed: ${err.message}`);
    }
    throw err;
  });

  const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
  if (!file) {
    throw new ValidationError('A resume file is required (field name "file")');
  }

  const result = await uploadResume(
    new Types.ObjectId(req.user!.sub),
    file.buffer,
    file.originalname,
    file.mimetype,
  );
  res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/resumes
 * List authenticated user's resumes
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const resumes = await listResumes(getUserId(req));
  res.json({ success: true, data: resumes });
});

/**
 * GET /api/resumes/:id
 * Get resume metadata
 */
router.get('/:id', validate(resumeIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const resume = await getResume(getUserId(req), getParamId(req.params));
  res.json({ success: true, data: resume });
});

/**
 * GET /api/resumes/:id/download
 * Download resume file
 */
router.get('/:id/download', validate(resumeIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { stream, filename, contentType } = await downloadResume(getUserId(req), getParamId(req.params));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    stream.pipe(res);
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
    } else {
      throw error;
    }
  }
});

/**
 * DELETE /api/resumes/:id
 * Delete resume
 */
router.delete('/:id', validate(resumeIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  await deleteResume(getUserId(req), getParamId(req.params));
  res.json({ success: true, data: { message: 'Resume deleted successfully' } });
});

/**
 * PATCH /api/resumes/:id/default
 * Set resume as default
 */
router.patch('/:id/default', validate(setDefaultResumeSchema), async (req: AuthenticatedRequest, res: Response) => {
  const resume = await setDefaultResume(getUserId(req), getParamId(req.params));
  res.json({ success: true, data: resume });
});

/**
 * POST /api/resumes/:id/analyze
 * Start/resume analysis
 */
router.post('/:id/analyze', validate(analyzeResumeSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await analyzeResume(getUserId(req), getParamId(req.params));
  res.json({ success: true, data: result });
});

/**
 * GET /api/resumes/:id/analysis
 * Get analysis results
 */
router.get('/:id/analysis', validate(resumeIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const analysis = await getAnalysis(getUserId(req), getParamId(req.params));
  if (!analysis) {
    throw new NotFoundError('Analysis', getParamId(req.params));
  }
  res.json({ success: true, data: analysis });
});

/**
 * POST /api/resumes/:id/analysis/retry
 * Retry failed analysis
 */
router.post('/:id/analysis/retry', validate(resumeIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await retryAnalysis(getUserId(req), getParamId(req.params));
  res.json({ success: true, data: result });
});

/**
 * POST /api/resumes/:id/import
 * Import extracted data to profile
 */
router.post('/:id/import', validate(importToProfileSchema), async (req: AuthenticatedRequest, res: Response) => {
  const result = await importToProfile(getUserId(req), getParamId(req.params), req.body.fields);
  res.json({ success: true, data: result });
});

export default router;