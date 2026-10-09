/** Resume Zod validation schemas. */

import { z } from 'zod';

export const uploadResumeSchema = z.object({
  file: z.any(), // Multer file
});

export const setDefaultResumeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const analyzeResumeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const resumeIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const importToProfileSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    fields: z.array(z.string()).min(1),
  }),
});

export type UploadResumeInput = z.infer<typeof uploadResumeSchema>;
export type SetDefaultResumeInput = z.infer<typeof setDefaultResumeSchema>;
export type AnalyzeResumeInput = z.infer<typeof analyzeResumeSchema>;
export type ResumeIdParam = z.infer<typeof resumeIdParamSchema.shape.params>;
export type ImportToProfileInput = z.infer<typeof importToProfileSchema.shape.body>;