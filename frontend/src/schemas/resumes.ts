import { z } from 'zod'

export const resumeListItemSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  status: z.string(),
  fileSize: z.number(),
  isDefault: z.boolean(),
  createdAt: z.string(),
})

export const resumeUploadSchema = z.object({
  resume: z.object({
    id: z.string(),
    originalFilename: z.string(),
    status: z.string(),
    isDefault: z.boolean(),
    createdAt: z.string(),
  }),
  analysis: z
    .object({
      id: z.string(),
      status: z.string(),
    })
    .nullable(),
})

export const resumeAnalysisSchema = z.object({
  id: z.string(),
  status: z.string(),
  extractedText: z.string().optional().default(''),
  structuredData: z.record(z.string(), z.unknown()).optional().default({}),
  warnings: z.array(z.object({ field: z.string(), message: z.string(), severity: z.string() })).optional().default([]),
  confidence: z.string().optional(),
})
