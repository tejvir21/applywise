import { jobDetailSchema, jobMatchesPageSchema, jobMatchExplanationSchema } from '@/schemas/jobs'
import { apiGet, apiPost } from '@/services/api'
import type { JobMatchExplanation, JobMatchesPage } from '@/types/api'

export async function getJobsTotal(): Promise<number> {
  const data = await apiGet<unknown>('/api/jobs?page=1&pageSize=1')
  const parsed = (data as { total?: unknown }).total
  if (typeof parsed !== 'number') throw new Error('Unexpected jobs response')
  return parsed
}

export async function getSavedJobsTotal(): Promise<number> {
  const data = await apiGet<unknown>('/api/jobs/saved?page=1&pageSize=1')
  const parsed = (data as { total?: unknown }).total
  if (typeof parsed !== 'number') throw new Error('Unexpected saved-jobs response')
  return parsed
}

export type JobDetail = {
  id: string
  title: string
  companyName: string
  location?: string
  remoteType?: string
  employmentType?: string
  experienceLevel?: string
  description?: string
  requirements: string[]
  requiredSkills: Array<{ name: string }>
  preferredSkills: Array<{ name: string }>
  applicationUrl?: string
  sources: Array<{ name: string }>
  source?: string
  status?: string
}

export async function getJob(jobId: string): Promise<JobDetail> {
  const data = await apiGet<unknown>(`/api/jobs/${jobId}`)
  return jobDetailSchema.parse(data) as JobDetail
}

export type JobMatchFilters = {
  minScore?: number
  page?: number
  pageSize?: number
}

export async function getJobMatches(filters: JobMatchFilters = {}): Promise<JobMatchesPage> {
  const params = new URLSearchParams()
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore))
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  const query = params.toString()
  const data = await apiGet<unknown>(`/api/jobs/matches${query ? `?${query}` : ''}`)
  return jobMatchesPageSchema.parse(data)
}

export async function getJobMatchExplanation(jobId: string): Promise<JobMatchExplanation> {
  const data = await apiGet<unknown>(`/api/jobs/${jobId}/match`)
  const parsed = (data as { match?: unknown }).match
  return jobMatchExplanationSchema.parse(parsed)
}

export type JobPriorityLabel = 'HIGH_PRIORITY' | 'GOOD_MATCH_NEEDS_IMPROVEMENT' | 'PROFILE_INCOMPLETE' | 'LOW_MATCH'

export type JobReadinessAssessment = {
  ready: boolean
  missingRequiredProfileFields: string[]
  missingRecommendedProfileFields: string[]
  matchedSkills: string[]
  missingSkills: string[]
}

export type PrioritizedJob = {
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
  priority: JobPriorityLabel
  priorityReasons: string[]
  readiness: JobReadinessAssessment
}

export type PrioritizedJobsPage = {
  jobs: PrioritizedJob[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getPrioritizedJobs(filters: JobMatchFilters = {}): Promise<PrioritizedJobsPage> {
  const params = new URLSearchParams()
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore))
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  const query = params.toString()
  return apiGet<PrioritizedJobsPage>(`/api/jobs/prioritized${query ? `?${query}` : ''}`)
}

export type ImportJobFromUrlResult = {
  job: {
    id: string
    title: string
    companyName: string
    location?: string
    applicationUrl?: string
    source?: string
    platform?: string
    scrapingAvailable: boolean
    capabilities: {
      detail?: string
      submission?: string
      upload?: string
      handoff?: string
      prepare?: string
    }
  }
  isDuplicate: boolean
  duplicateJobId?: string
}

export async function importJobFromUrl(body: {
  url: string
  title?: string
  companyName?: string
  location?: string
  description?: string
  applicationUrl?: string
  remoteType?: string
  employmentType?: string
  experienceLevel?: string
}): Promise<ImportJobFromUrlResult> {
  const data = await apiPost<ImportJobFromUrlResult>('/api/jobs/import/url', body)
  return data
}
