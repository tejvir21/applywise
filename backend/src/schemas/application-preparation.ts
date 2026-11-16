/** Application preparation Zod validation schemas (Phase 8.3.13). */

import { z } from 'zod';

const objectIdSchema = z.string().min(1);

// POST /api/application-preparations
export const createPreparationSchema = z.object({
  body: z.object({
    jobId: objectIdSchema,
    resumeId: objectIdSchema.optional(),
  }).strict(),
});

// PATCH /api/application-preparations/:id
export const updatePreparationSchema = z.object({
  body: z.object({
    missingInformation: z.array(z.string().max(200)).optional(),
  }).strict(),
});

// POST /api/application-preparations/:id/tailor-resume
export const tailorResumeSchema = z.object({
  body: z.object({
    replace: z.boolean().default(false),
  }).strict(),
});

// POST /api/application-preparations/:id/cover-letter
export const coverLetterSchema = z.object({
  body: z.object({
    replace: z.boolean().default(false),
  }).strict(),
});

// POST /api/application-preparations/:id/answers
export const prepareAnswersSchema = z.object({
  body: z.object({
    questions: z.array(z.string().min(1).max(500)).min(1).max(50),
  }).strict(),
});

// PATCH /api/application-preparations/:id/answers/:answerId
export const updateAnswerSchema = z.object({
  params: z.object({
    answerId: z.string().min(1),
  }),
  body: z.object({
    answer: z.string().min(1).max(5000).optional(),
    verified: z.boolean().optional(),
    reviewStatus: z.enum([
      'GENERATED',
      'NEEDS_CANDIDATE_INPUT',
      'NEEDS_REVIEW',
      'APPROVED',
      'REJECTED',
    ]).optional(),
    reviewerNote: z.string().max(1000).optional(),
  }).strict(),
});

// POST /api/application-preparations/:id/review
export const reviewPreparationSchema = z.object({
  body: z.object({
    component: z.enum(['tailoredResume', 'coverLetter', 'answers', 'package']).optional(),
    answerId: z.string().optional(),
    decision: z.enum(['approve', 'reject']).optional(),
    note: z.string().max(1000).optional(),
  }).strict(),
});

// POST /api/application-preparations/:id/save
export const savePreparationSchema = z.object({
  body: z.object({}).strict(),
});

// :id param
export const preparationIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export type CreatePreparationInput = z.infer<typeof createPreparationSchema.shape.body>;
export type UpdatePreparationInput = z.infer<typeof updatePreparationSchema.shape.body>;
export type TailorResumeInput = z.infer<typeof tailorResumeSchema.shape.body>;
export type CoverLetterInput = z.infer<typeof coverLetterSchema.shape.body>;
export type PrepareAnswersInput = z.infer<typeof prepareAnswersSchema.shape.body>;
export type UpdateAnswerInput = z.infer<typeof updateAnswerSchema.shape.body>;
export type ReviewPreparationInput = z.infer<typeof reviewPreparationSchema.shape.body>;
