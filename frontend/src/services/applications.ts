import {
  applicationEventsSchema,
  applicationListPageSchema,
  applicationMaterialsResponseSchema,
  jobApplicationSchema,
} from '@/schemas/applications'
import { apiGet, apiPatch, apiPost } from '@/services/api'
import type {
  ApplicationEvent,
  ApplicationListPage,
  JobApplication,
} from '@/types/api'

export type ApplicationMaterialsData = {
  materials: {
    coverLetter?: string
    answers: Array<{ question: string; answer: string; verified: boolean; sensitive: boolean }>
    notes?: string
    tailoredResume?: {
      summary: string
      highlights: string[]
      skillsUsed: string[]
      flaggedGaps: string[]
      generatedAt: string
    }
  }
  provenance?: {
    provider?: string
    model?: string
    generatedAt?: string
  }
  reviewedAt?: string
  status: string
}

export type ApplicationFilters = {
  status?: string
  page?: number
  pageSize?: number
}

export async function getApplications(filters: ApplicationFilters = {}): Promise<ApplicationListPage> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  const query = params.toString()
  const data = await apiGet<unknown>(`/api/applications${query ? `?${query}` : ''}`)
  return applicationListPageSchema.parse(data)
}

export async function getApplication(id: string): Promise<JobApplication> {
  const data = await apiGet<unknown>(`/api/applications/${id}`)
  return jobApplicationSchema.parse(data)
}

export async function createApplication(body: {
  jobId: string
  resumeId?: string
  mode?: 'auto' | 'permission'
}): Promise<JobApplication> {
  const data = await apiPost<unknown>('/api/applications', body)
  return jobApplicationSchema.parse(data)
}

export async function requestApplicationReview(
  id: string,
  confirmUnverified = false,
): Promise<JobApplication> {
  const data = await apiPost<unknown>(`/api/applications/${id}/request-review`, { confirmUnverified })
  return jobApplicationSchema.parse(data)
}

export async function decideApplication(
  id: string,
  decision: 'approve' | 'reject',
  note?: string,
  confirmUnverified = false,
): Promise<JobApplication> {
  const data = await apiPost<unknown>(`/api/applications/${id}/approve`, { decision, note, confirmUnverified })
  return jobApplicationSchema.parse(data)
}

export async function cancelApplication(id: string): Promise<JobApplication> {
  const data = await apiPost<unknown>(`/api/applications/${id}/cancel`)
  return jobApplicationSchema.parse(data)
}

export async function getApplicationEvents(id: string): Promise<ApplicationEvent[]> {
  const data = await apiGet<unknown>(`/api/applications/${id}/events`)
  return applicationEventsSchema.parse(data).events
}

export async function updateApplicationDraft(
  id: string,
  body: { resumeId?: string; mode?: 'auto' | 'permission' },
): Promise<JobApplication> {
  const data = await apiPatch<unknown>(`/api/applications/${id}`, body)
  return jobApplicationSchema.parse(data)
}

export async function getApplicationMaterials(id: string): Promise<ApplicationMaterialsData> {
  const data = await apiGet<unknown>(`/api/applications/${id}/materials`)
  return applicationMaterialsResponseSchema.parse(data) as ApplicationMaterialsData
}

export async function generateCoverLetter(id: string, replace = false) {
  const data = await apiPost<{ coverLetter: string; flaggedGaps: string[] }>(
    `/api/applications/${id}/materials/cover-letter`,
    { replace },
  )
  return data
}

export async function generateResumeDraft(id: string, replace = false) {
  const data = await apiPost<{
    tailoredResume: ApplicationMaterialsData['materials']['tailoredResume']
  }>(`/api/applications/${id}/materials/resume`, { replace })
  return data
}

export async function generateAnswer(id: string, question: string, replace = false) {
  const data = await apiPost<{
    answer: { question: string; answer: string; verified: boolean; sensitive: boolean }
  }>(`/api/applications/${id}/materials/answers`, { question, replace })
  return data
}

export async function updateApplicationMaterials(
  id: string,
  body: {
    coverLetter?: string
    notes?: string
    answers?: Array<{ question: string; answer: string; verified?: boolean; sensitive?: boolean }>
  },
): Promise<ApplicationMaterialsData> {
  const data = await apiPatch<unknown>(`/api/applications/${id}/materials`, body)
  return applicationMaterialsResponseSchema.parse(data) as ApplicationMaterialsData
}

export async function markMaterialsReviewed(id: string): Promise<ApplicationMaterialsData> {
  const data = await apiPost<unknown>(`/api/applications/${id}/materials/review`)
  return applicationMaterialsResponseSchema.parse(data) as ApplicationMaterialsData
}
