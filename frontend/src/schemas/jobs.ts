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

export const jobDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  companyWebsite: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  remoteType: z.string().optional(),
  employmentType: z.string().optional(),
  experienceLevel: z.string().optional(),
  description: z.string().optional(),
  responsibilities: z.array(z.string()).optional().default([]),
  requirements: z.array(z.string()).optional().default([]),
  requiredSkills: z.array(z.object({ name: z.string() })).optional().default([]),
  preferredSkills: z.array(z.object({ name: z.string() })).optional().default([]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  salaryPeriod: z.string().optional(),
  applicationUrl: z.string().optional(),
  sources: z.array(z.object({ name: z.string() })).optional().default([]),
  source: z.string().optional(),
  status: z.string().optional(),
  postedAt: z.string().optional(),
  discoveredAt: z.string().optional(),
})

// ---- Live discovery (GET /api/jobs/search) ----

export const discoveredJobSchema = z.object({
  dedupeKey: z.string(),
  externalId: z.string(),
  canonicalUrl: z.string(),
  applicationUrl: z.string().optional(),
  title: z.string(),
  companyName: z.string(),
  location: z.string().optional(),
  country: z.string().optional(),
  countryIso: z.string().optional(),
  remoteType: z.string().optional(),
  remoteEligibility: z.string().optional(),
  indiaEligible: z.boolean(),
  employmentType: z.string().optional(),
  description: z.string().optional(),
  sourceName: z.string(),
  sourceProvider: z.string(),
  sourceDisplayName: z.string(),
  discoveredViaQuery: z.string().optional(),
  // Distinct dates: posting vs source-update vs when we fetched it.
  postedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  fetchedAt: z.string(),
  dateConfidence: z.string(),
  isNewWithin7: z.boolean().optional(),
  olderListing: z.boolean().optional(),
})

export const discoverySourceSchema = z.object({
  sourceName: z.string(),
  sourceProvider: z.string(),
  sourceDisplayName: z.string(),
  state: z.enum([
    'connected_with_results',
    'connected_no_matches',
    'not_configured',
    'rate_limited',
    'temporarily_unavailable',
    'blocked_upstream',
  ]),
  fetchedCount: z.number(),
  upstreamTotal: z.number().optional(),
  pagesFetched: z.number(),
  error: z.string().optional(),
})

export const discoverySearchPageSchema = z.object({
  jobs: z.array(discoveredJobSchema),
  totalUnique: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  queries: z.array(z.string()),
  within7Count: z.number(),
  olderCount: z.number(),
  undatedCount: z.number(),
  excluded: z.object({
    duplicates: z.number(),
    relevance: z.number(),
    geo: z.number(),
    freshness: z.number(),
  }),
  sources: z.array(discoverySourceSchema),
  fetchedAt: z.string(),
  hasMore: z.boolean(),
})
