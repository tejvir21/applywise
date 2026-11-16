/** Application preparation API client (Phase 8.3.13).
 *
 * Provides typed access to the backend preparation endpoints:
 *   POST /api/application-preparations        — start preparation
 *   GET /api/application-preparations         — list preparations
 *   GET /api/application-preparations/:id     — get preparation details
 *   PATCH /api/application-preparations/:id   — update draft data
 *   POST /api/application-preparations/:id/tailor-resume
 *   POST /api/application-preparations/:id/cover-letter
 *   POST /api/application-preparations/:id/answers
 *   PATCH /api/application-preparations/:id/answers/:answerId
 *   POST /api/application-preparations/:id/review
 *   POST /api/application-preparations/:id/save
 *   DELETE /api/application-preparations/:id  — cancel
 *
 * Nothing here submits an application — preparation is draft-only.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/services/api'

export type PreparationStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export type ComponentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type VerificationStatus = 'VERIFIED' | 'UNSUPPORTED' | 'NEEDS_CANDIDATE_INPUT'

export type VerificationFreshness = 'FRESH' | 'STALE' | 'MISSING_PROVENANCE'

export type VerificationResult = {
  status: VerificationStatus
  reason?: string
  matchedFacts?: string[]
  unsupportedClaims?: string[]
  freshness?: VerificationFreshness
  staleReason?: string
}

export type AnswerReviewStatus =
  | 'GENERATED'
  | 'NEEDS_CANDIDATE_INPUT'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'

export type PreparedAnswer = {
  _id: string
  question: string
  answer: string
  verified: boolean
  sensitive: boolean
  source?: string
  reviewStatus: AnswerReviewStatus
  reviewedAt?: string
  reviewerNote?: string
  verification?: VerificationResult
}

export type TailoredResume = {
  summary: string
  highlights: string[]
  skillsUsed: string[]
  flaggedGaps: string[]
  generatedAt: string
  reviewStatus: ComponentReviewStatus
  reviewedAt?: string
  reviewerNote?: string
  verification?: VerificationResult
}

export type CoverLetter = {
  body: string
  flaggedGaps: string[]
  generatedAt: string
  reviewStatus: ComponentReviewStatus
  reviewedAt?: string
  reviewerNote?: string
  verification?: VerificationResult
}

export type ApplicationPreparation = {
  id: string
  userId: string
  jobId: string
  jobSnapshot: { title: string; companyName: string }
  resumeId?: string
  resumeVersion?: number
  status: PreparationStatus
  missingInformation: string[]
  tailoredResume?: TailoredResume
  coverLetter?: CoverLetter
  answers: PreparedAnswer[]
  materialsProvenance?: {
    provider: string
    model: string
    generatedAt: string
  }
  createdAt: string
  updatedAt: string
}

export type PreparationsPage = {
  preparations: ApplicationPreparation[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type StartPreparationResult = {
  preparationId: string
  status: PreparationStatus
  job: { id: string; title: string; companyName: string }
  readiness: {
    ready: boolean
    missingRequiredProfileFields: string[]
    missingRecommendedProfileFields: string[]
    matchedSkills: string[]
    missingSkills: string[]
  }
  missingInformation: string[]
}

/** Start preparation for a job. Returns existing preparation if active. */
export async function startPreparation(
  jobId: string,
  resumeId?: string,
): Promise<StartPreparationResult> {
  const body: Record<string, unknown> = { jobId }
  if (resumeId) body.resumeId = resumeId
  const data = await apiPost<StartPreparationResult>(
    '/api/application-preparations',
    body,
  )
  return data
}

/** List the candidate's preparations. */
export async function listPreparations(options?: {
  status?: PreparationStatus
  page?: number
  pageSize?: number
  query?: string
}): Promise<PreparationsPage> {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)
  if (options?.page !== undefined) params.set('page', String(options.page))
  if (options?.pageSize !== undefined)
    params.set('pageSize', String(options.pageSize))
  if (options?.query) params.set('query', options.query)
  const query = params.toString()
  const data = await apiGet<PreparationsPage>(
    `/api/application-preparations${query ? `?${query}` : ''}`,
  )
  return data
}

/** Get preparation details. */
export async function getPreparation(
  preparationId: string,
): Promise<ApplicationPreparation> {
  const data = await apiGet<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}`,
  )
  return data
}

/** Update draft data (e.g. missing information). */
export async function savePreparation(
  preparationId: string,
  body: { missingInformation?: string[] },
): Promise<ApplicationPreparation> {
  const data = await apiPatch<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}`,
    body,
  )
  return data
}

/** Generate a tailored resume. */
export async function generateTailoredResume(
  preparationId: string,
  options: { replace?: boolean } = {},
): Promise<{
  tailoredResume: TailoredResume
  provider: string
  model: string
}> {
  const data = await apiPost<{
    tailoredResume: TailoredResume
    provider: string
    model: string
  }>(`/api/application-preparations/${preparationId}/tailor-resume`, {
    replace: options.replace,
  })
  return data
}

/** Generate a cover letter. */
export async function generateCoverLetter(
  preparationId: string,
  options: { replace?: boolean } = {},
): Promise<{
  coverLetter: CoverLetter
  provider: string
  model: string
}> {
  const data = await apiPost<{
    coverLetter: CoverLetter
    provider: string
    model: string
  }>(`/api/application-preparations/${preparationId}/cover-letter`, {
    replace: options.replace,
  })
  return data
}

/** Generate answers for supplied questions. */
export async function generateAnswers(
  preparationId: string,
  questions: string[],
): Promise<{
  answers: PreparedAnswer[]
  provider: string
  model: string
}> {
  const data = await apiPost<{
    answers: PreparedAnswer[]
    provider: string
    model: string
  }>(`/api/application-preparations/${preparationId}/answers`, {
    questions,
  })
  return data
}

/** Edit an individual answer. */
export async function updateAnswer(
  preparationId: string,
  answerId: string,
  body: {
    answer?: string
    verified?: boolean
    reviewStatus?: AnswerReviewStatus
    reviewerNote?: string
  },
): Promise<ApplicationPreparation> {
  const data = await apiPatch<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}/answers/${answerId}`,
    body,
  )
  return data
}

/** Review a component or the whole package. */
export async function reviewPreparation(
  preparationId: string,
  body: {
    component?: 'tailoredResume' | 'coverLetter' | 'answers' | 'package'
    answerId?: string
    decision?: 'approve' | 'reject'
    note?: string
  },
): Promise<ApplicationPreparation> {
  const data = await apiPost<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}/review`,
    body,
  )
  return data
}

/** Cancel a preparation. */
export async function cancelPreparation(
  preparationId: string,
): Promise<ApplicationPreparation> {
  const data = await apiDelete<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}`,
  )
  return data
}

/** Reopen a cancelled or rejected preparation. */
export async function reopenPreparation(
  preparationId: string,
): Promise<ApplicationPreparation> {
  const data = await apiPost<ApplicationPreparation>(
    `/api/application-preparations/${preparationId}/reopen`,
    {},
  )
  return data
}
