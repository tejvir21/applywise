import { preferencesSchema, profileSchema } from '@/schemas/profile'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/services/api'
import { ApiClientError } from '@/types/api'

export type CandidateProfile = {
  firstName: string
  lastName: string
  displayName?: string
  email?: string
  phone?: string
  location?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  headline?: string
  professionalSummary?: string
  yearsOfExperience?: number
  currentJobTitle?: string
  currentCompany?: string
  skills: Array<{ _id?: string; name: string; level?: string; years?: number }>
}

export type JobPreferences = {
  desiredRoles: string[]
  preferredLocations: string[]
  preferredCountries: string[]
  workMode: string[]
  employmentTypes: string[]
  experienceLevels: string[]
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  salaryPeriod?: string
  industries: string[]
  requiredSkills: string[]
  preferredSkills: string[]
  excludedCompanies: string[]
  excludedJobTypes: string[]
}

export async function getProfile(): Promise<CandidateProfile | null> {
  try {
    const data = await apiGet<unknown>('/api/profile')
    return profileSchema.parse(data) as CandidateProfile
  } catch (err) {
    // No profile yet is a normal state, not an error.
    if (err instanceof ApiClientError && (err.code === 'NOT_FOUND' || err.status === 404)) return null
    throw err
  }
}

export async function createProfile(body: Record<string, unknown>): Promise<CandidateProfile> {
  const data = await apiPost<unknown>('/api/profile', body)
  return profileSchema.parse(data) as CandidateProfile
}

export async function updateProfile(body: Record<string, unknown>): Promise<CandidateProfile> {
  const data = await apiPatch<unknown>('/api/profile', body)
  return profileSchema.parse(data) as CandidateProfile
}

export async function getPreferences(): Promise<JobPreferences> {
  const data = await apiGet<unknown>('/api/profile/preferences')
  return preferencesSchema.parse(data) as JobPreferences
}

export async function savePreferences(body: Record<string, unknown>): Promise<JobPreferences> {
  const data = await apiPut<unknown>('/api/profile/preferences', body)
  return preferencesSchema.parse(data) as JobPreferences
}

export async function addProfileSkill(skill: { name: string; level?: string }): Promise<CandidateProfile> {
  const data = await apiPost<unknown>('/api/profile/skills', skill)
  return profileSchema.parse(data) as CandidateProfile
}

export async function getProfileCompletion(): Promise<{
  percentage: number
  completedSections: string[]
  incompleteSections: string[]
}> {
  const data = await apiGet<unknown>('/api/profile/completion')
  const parsed = data as { percentage?: unknown; completedSections?: unknown; incompleteSections?: unknown }
  if (typeof parsed.percentage !== 'number') throw new Error('Unexpected completion response')
  return {
    percentage: parsed.percentage,
    completedSections: Array.isArray(parsed.completedSections) ? (parsed.completedSections as string[]) : [],
    incompleteSections: Array.isArray(parsed.incompleteSections) ? (parsed.incompleteSections as string[]) : [],
  }
}

export async function removeProfileSkill(skillId: string): Promise<CandidateProfile> {
  const data = await apiDelete<unknown>(`/api/profile/skills/${skillId}`)
  return profileSchema.parse(data) as CandidateProfile
}
