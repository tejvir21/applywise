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
    fields: z.array(z.string()).min(1).max(50),
    // Verified skill names the user rejected in review; excluded from import
    // (case-insensitive) and reported in `skipped`. Optional for compatibility.
    excludeSkills: z.array(z.string().max(100)).max(100).optional(),
    // Review-candidate terms the user explicitly approved for import
    // (case-insensitive). The only path for non-dictionary terms.
    includeReview: z.array(z.string().max(100)).max(100).optional(),
    // Import mode: 'fill' (default, legacy fill-only-empty), 'select', or
    // 'review' (only explicitly listed fields touched).
    mode: z.enum(['fill', 'select', 'review']).optional(),
    // Skills handling: 'merge' (default, additive) or 'replace' (destructive).
    skillsMode: z.enum(['merge', 'replace']).optional(),
    // Existing profile skill names to remove (destructive, needs confirmation).
    removeSkills: z.array(z.string().max(100)).max(100).optional(),
    // Concurrency preconditions: expected current values by subkey path.
    expected: z.record(z.string(), z.unknown()).optional(),
    // Final user confirmation for destructive changes.
    confirmReplace: z.boolean().optional(),
  }),
});

export type UploadResumeInput = z.infer<typeof uploadResumeSchema>;
export type SetDefaultResumeInput = z.infer<typeof setDefaultResumeSchema>;
export type AnalyzeResumeInput = z.infer<typeof analyzeResumeSchema>;
export type ResumeIdParam = z.infer<typeof resumeIdParamSchema.shape.params>;
export type ImportToProfileInput = z.infer<typeof importToProfileSchema.shape.body>;