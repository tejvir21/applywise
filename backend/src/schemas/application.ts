/** Application Zod validation schemas (Phase 6). */

import { z } from 'zod';

const objectIdSchema = z.string().min(1);

// Draft answer to an application question
export const applicationAnswerSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
  verified: z.boolean().default(false),
  sensitive: z.boolean().default(false),
});

export const applicationMaterialsSchema = z.object({
  coverLetter: z.string().max(20000).optional(),
  answers: z.array(applicationAnswerSchema).max(100).default([]),
  notes: z.string().max(5000).optional(),
});

// POST /api/applications
export const createApplicationSchema = z.object({
  body: z.object({
    jobId: objectIdSchema,
    resumeId: objectIdSchema.optional(),
    mode: z.enum(['auto', 'permission']).default('permission'),
    materials: applicationMaterialsSchema.optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  }).strict(),
});

// PATCH /api/applications/:id (draft fields only)
export const updateDraftSchema = z.object({
  body: z.object({
    resumeId: objectIdSchema.optional(),
    mode: z.enum(['auto', 'permission']).optional(),
    materials: applicationMaterialsSchema.optional(),
  }).strict(),
});

// POST /api/applications/:id/request-review
export const requestReviewSchema = z.object({
  body: z.object({
    confirmUnverified: z.boolean().default(false),
  }).strict(),
});

// POST /api/applications/:id/approve
export const decideApplicationSchema = z.object({
  body: z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(1000).optional(),
    confirmUnverified: z.boolean().default(false),
  }).strict(),
});

// GET /api/applications
export const listApplicationsQuerySchema = z.object({
  query: z.object({
    status: z.enum([
      'DRAFT',
      'READY_FOR_REVIEW',
      'AWAITING_APPROVAL',
      'APPROVED',
      'SUBMITTING',
      'SUBMITTED',
      'FAILED',
      'NEEDS_MANUAL_ACTION',
      'CANCELLED',
    ]).optional(),
    jobId: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// :id param
export const applicationIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

// POST /api/applications/:id/materials/cover-letter and /resume
export const generateMaterialsSchema = z.object({
  body: z.object({
    replace: z.boolean().default(false),
  }).strict(),
});

// POST /api/applications/:id/materials/answers
export const generateAnswerSchema = z.object({
  body: z.object({
    question: z.string().min(1).max(500),
    replace: z.boolean().default(false),
  }).strict(),
});

// PATCH /api/applications/:id/materials (candidate edits; DRAFT only)
export const updateMaterialsSchema = z.object({
  body: z.object({
    coverLetter: z.string().max(20000).optional(),
    notes: z.string().max(5000).optional(),
    answers: z.array(applicationAnswerSchema).max(100).optional(),
    tailoredResume: z.object({
      summary: z.string().max(5000).optional(),
      highlights: z.array(z.string().max(1000)).max(20).optional(),
      skillsUsed: z.array(z.string().max(100)).optional(),
    }).strict().optional(),
  }).strict(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema.shape.body>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema.shape.body>;
