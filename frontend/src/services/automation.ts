/** Browser automation API client (Phase 9.1). */

import { apiGet, apiPost, apiPatch } from '@/services/api'

export type AutomationExecutionState =
  | 'CREATED'
  | 'INSPECTING'
  | 'FORM_DETECTED'
  | 'AWAITING_CANDIDATE_INPUT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED_FOR_EXECUTION'
  | 'FILLING'
  | 'FILLED'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_MANUAL_ACTION'

export type AutomationFieldMapping = {
  fieldId: string
  fieldLabel: string
  fieldType: string
  value: string | null
  source: string | null
  verified: boolean
  result: 'MAPPED' | 'UNMAPPED' | 'NEEDS_CANDIDATE_INPUT' | 'UNSUPPORTED'
  reason?: string
}

export type AutomationExecution = {
  id: string
  userId: string
  jobId?: string
  preparationId?: string
  platform?: string
  applicationUrl: string
  state: AutomationExecutionState
  detectedFields?: Array<{
    id: string
    label: string
    type: string
    required: boolean
    options?: string[]
    confidence: number
  }>
  fieldMappings?: AutomationFieldMapping[]
  filledFields?: Array<{ fieldId: string; fieldLabel: string; status: string; value?: string; error?: string; verified: boolean }>
  skippedFields?: Array<{ fieldId: string; fieldLabel: string; status: string; value?: string; error?: string; verified: boolean }>
  failedFields?: Array<{ fieldId: string; fieldLabel: string; status: string; value?: string; error?: string; verified: boolean }>
  candidateInputRequired?: AutomationFieldMapping[]
  selectedResumeId?: string
  approvedForExecution: boolean
  pauseReason?: string
  errorDetails?: string
  createdAt: string
  updatedAt: string
}

export type AutomationExecutionsPage = {
  executions: AutomationExecution[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function createAutomationExecution(body: {
  applicationUrl: string
  jobId?: string
  preparationId?: string
  resumeId?: string
  platform?: string
}): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>('/api/automation/executions', body)
  return data
}

export async function listAutomationExecutions(options?: {
  page?: number
  pageSize?: number
}): Promise<AutomationExecutionsPage> {
  const params = new URLSearchParams()
  if (options?.page !== undefined) params.set('page', String(options.page))
  if (options?.pageSize !== undefined) params.set('pageSize', String(options.pageSize))
  const query = params.toString()
  const data = await apiGet<AutomationExecutionsPage>(
    `/api/automation/executions${query ? `?${query}` : ''}`,
  )
  return data
}

export async function getAutomationExecution(executionId: string): Promise<AutomationExecution> {
  const data = await apiGet<AutomationExecution>(`/api/automation/executions/${executionId}`)
  return data
}

export async function inspectAutomationExecution(
  executionId: string,
  applicationUrl: string,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(
    `/api/automation/executions/${executionId}/inspect`,
    { applicationUrl },
  )
  return data
}

export async function updateAutomationAnswers(
  executionId: string,
  answers: Array<{ fieldId: string; value: string }>,
): Promise<AutomationExecution> {
  const data = await apiPatch<AutomationExecution>(`/api/automation/executions/${executionId}/answers`, { answers })
  return data
}

export async function reviewAutomationExecution(
  executionId: string,
  approved: boolean,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(`/api/automation/executions/${executionId}/review`, { approved })
  return data
}

export async function pauseAutomationExecution(
  executionId: string,
  reason?: string,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(`/api/automation/executions/${executionId}/pause`, { reason })
  return data
}

export async function resumeAutomationExecution(
  executionId: string,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(`/api/automation/executions/${executionId}/resume`, {})
  return data
}

export async function cancelAutomationExecution(
  executionId: string,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(`/api/automation/executions/${executionId}/cancel`, {})
  return data
}

export async function fillAutomationExecution(
  executionId: string,
): Promise<AutomationExecution> {
  const data = await apiPost<AutomationExecution>(`/api/automation/executions/${executionId}/fill`, {})
  return data
}

export async function getAutomationEvidence(
  executionId: string,
): Promise<AutomationExecution> {
  const data = await apiGet<AutomationExecution>(`/api/automation/executions/${executionId}/evidence`)
  return data
}