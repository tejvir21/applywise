import { jobMatchesPageSchema, jobMatchExplanationSchema } from '@/schemas/jobs'
import { apiGet } from '@/services/api'
import type { JobMatchExplanation, JobMatchesPage } from '@/types/api'

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
