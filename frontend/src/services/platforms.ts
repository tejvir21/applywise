import { handoffSchema, platformDescriptorSchema, platformListSchema, policyEvaluationSchema } from '@/schemas/platforms'
import { apiGet, apiPost, apiPut } from '@/services/api'

export type PlatformDescriptor = {
  platform: string
  displayName: string
  website?: string
  capabilities: Record<string, { status: string; evidence?: string; authorization?: string; notes?: string }>
  lastReviewed: string
}

export type PolicyEvaluation = {
  decision: 'auto_allowed' | 'approval_required' | 'manual_only' | 'blocked'
  reasons: string[]
  platform: string
}

export async function getPlatforms(): Promise<PlatformDescriptor[]> {
  const data = await apiGet<unknown>('/api/platforms')
  return platformListSchema.parse(data).platforms as PlatformDescriptor[]
}

export async function getPlatformDescriptor(platform: string): Promise<PlatformDescriptor> {
  const data = await apiGet<unknown>(`/api/platforms/${platform}`)
  return platformDescriptorSchema.parse(data) as PlatformDescriptor
}

export async function evaluateApplicationPolicy(applicationId: string, platform: string): Promise<PolicyEvaluation> {
  const data = await apiPost<unknown>(`/api/applications/${applicationId}/policy`, { platform })
  return policyEvaluationSchema.parse(data)
}

export async function requestApplicationHandoff(applicationId: string): Promise<{
  applicationUrl: string
  instructions: string[]
  status: string
}> {
  const data = await apiPost<unknown>(`/api/applications/${applicationId}/handoff`)
  const parsed = handoffSchema.parse(data)
  return parsed.handoff as { applicationUrl: string; instructions: string[]; status: string }
}

export async function getSubmissionSettings(): Promise<{
  globalPaused: boolean
  dailyLimit: number
  minMatchScore: number
  platforms: Array<{ platform: string; mode: string; authorized: boolean }>
}> {
  return apiGet('/api/platforms/settings/submission') as Promise<{
    globalPaused: boolean
    dailyLimit: number
    minMatchScore: number
    platforms: Array<{ platform: string; mode: string; authorized: boolean }>
  }>
}

export async function updateSubmissionSettings(body: {
  globalPaused?: boolean
  dailyLimit?: number
  minMatchScore?: number
  platforms?: Array<{ platform: string; mode: string; authorized: boolean }>
}) {
  return apiPut('/api/platforms/settings/submission', body)
}
