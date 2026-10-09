import { z } from 'zod'

export const matchFactorSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  evaluable: z.boolean(),
  score: z.number().nullable(),
  countedWeight: z.number(),
  detail: z.string(),
  matched: z.array(z.string()),
  mismatched: z.array(z.string()),
})

export const jobMatchExplanationSchema = z.object({
  score: z.number(),
  eligible: z.boolean(),
  eligibilityReasons: z.array(z.string()),
  factors: z.array(matchFactorSchema),
  missingData: z.array(z.string()),
  evaluatedWeight: z.number(),
})

export const matchedJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  location: z.string().optional(),
  remoteType: z.string().optional(),
  employmentType: z.string().optional(),
  experienceLevel: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  postedAt: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  matchScore: z.number(),
  eligible: z.boolean(),
})

export const jobMatchesPageSchema = z.object({
  matches: z.array(matchedJobSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  scanned: z.number(),
})
