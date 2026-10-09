import { z } from 'zod'

export const applicationAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
  verified: z.boolean(),
  sensitive: z.boolean(),
})

export const jobApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobSnapshot: z.object({ title: z.string(), companyName: z.string() }),
  resumeId: z.string().optional(),
  resumeVersion: z.number().optional(),
  matchScore: z.number().optional(),
  matchEligible: z.boolean().optional(),
  matchExplanation: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(['auto', 'permission']),
  materials: z.object({
    coverLetter: z.string().optional(),
    answers: z.array(applicationAnswerSchema),
    notes: z.string().optional(),
  }),
  status: z.string(),
  decidedAt: z.string().optional(),
  decisionNote: z.string().optional(),
  attemptCount: z.number(),
  lastError: z.string().optional(),
  manualActionRequired: z.string().optional(),
  unverifiedConfirmedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const applicationListPageSchema = z.object({
  applications: z.array(jobApplicationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
})

export const applicationEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  fromStatus: z.string().optional(),
  toStatus: z.string().optional(),
  message: z.string().optional(),
  createdAt: z.string(),
})

export const applicationEventsSchema = z.object({
  events: z.array(applicationEventSchema),
})
