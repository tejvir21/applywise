export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiErrorBody = {
  success: false
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody

export type HealthStatus = 'ok' | 'degraded'

export type HealthData = {
  status: HealthStatus
  service: string
  version: string
  environment: string
  mongodb: 'connected' | 'disconnected' | 'error'
  ai_provider: string
  storage_provider: string
  browser_automation_provider: string
  /** Sanitized storage topology (provider names + booleans only). */
  storage?: {
    active: string
    primary: string
    fallback: string
    healthy: boolean
    durable: boolean
    degraded: boolean
    reason?: string
  }
}

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Record<string, unknown>

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export type MatchFactor = {
  key: string
  label: string
  weight: number
  evaluable: boolean
  score: number | null
  countedWeight: number
  detail: string
  matched: string[]
  mismatched: string[]
}

export type JobMatchExplanation = {
  score: number
  eligible: boolean
  eligibilityReasons: string[]
  factors: MatchFactor[]
  missingData: string[]
  evaluatedWeight: number
}

export type MatchedJob = {
  id: string
  title: string
  companyName: string
  location?: string
  remoteType?: string
  employmentType?: string
  experienceLevel?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  salaryPeriod?: string
  postedAt?: string
  status?: string
  source?: string
  matchScore: number
  eligible: boolean
}

export type JobMatchesPage = {
  matches: MatchedJob[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  scanned: number
}

// ---- Live discovery (GET /api/jobs/search) ----

export type SourceState =
  | 'connected_with_results'
  | 'connected_no_matches'
  | 'not_configured'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'blocked_upstream'

export type DiscoveredJob = {
  dedupeKey: string
  externalId: string
  canonicalUrl: string
  applicationUrl?: string
  title: string
  companyName: string
  location?: string
  country?: string
  countryIso?: string
  remoteType?: string
  remoteEligibility?: string
  indiaEligible: boolean
  employmentType?: string
  description?: string
  sourceName: string
  sourceProvider: string
  sourceDisplayName: string
  discoveredViaQuery?: string
  postedAt?: string
  updatedAt?: string
  fetchedAt: string
  dateConfidence: string
  isNewWithin7?: boolean
  olderListing?: boolean
}

export type DiscoverySourceResult = {
  sourceName: string
  sourceProvider: string
  sourceDisplayName: string
  state: SourceState
  fetchedCount: number
  upstreamTotal?: number
  pagesFetched: number
  error?: string
}

export type DiscoveryFilters = {
  roles: string
  location?: string
  freshness?: 'any' | 'last7' | 'last14' | 'last30'
  sort?: 'relevance' | 'newest'
  includeRemote?: boolean
  includeWorldwideRemote?: boolean
  countryIso?: string
  page?: number
  pageSize?: number
}

export type DiscoveryPage = {
  jobs: DiscoveredJob[]
  totalUnique: number
  page: number
  pageSize: number
  totalPages: number
  queries: string[]
  within7Count: number
  olderCount: number
  undatedCount: number
  excluded: { duplicates: number; relevance: number; geo: number; freshness: number }
  sources: DiscoverySourceResult[]
  fetchedAt: string
  hasMore: boolean
}

export type ApplicationAnswer = {
  question: string
  answer: string
  verified: boolean
  sensitive: boolean
}

export type JobApplication = {
  id: string
  jobId: string
  jobSnapshot: { title: string; companyName: string }
  resumeId?: string
  resumeVersion?: number
  matchScore?: number
  matchEligible?: boolean
  matchExplanation?: Record<string, unknown>
  mode: 'auto' | 'permission'
  materials: {
    coverLetter?: string
    answers: ApplicationAnswer[]
    notes?: string
  }
  status: string
  decidedAt?: string
  decisionNote?: string
  attemptCount: number
  lastError?: string
  manualActionRequired?: string
  unverifiedConfirmedAt?: string
  createdAt: string
  updatedAt: string
}

export type ApplicationListPage = {
  applications: JobApplication[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ApplicationEvent = {
  id: string
  type: string
  fromStatus?: string
  toStatus?: string
  message?: string
  createdAt: string
}
