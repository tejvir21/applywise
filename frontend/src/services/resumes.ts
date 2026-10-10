import { resumeAnalysisSchema, resumeListItemSchema, resumeUploadSchema } from '@/schemas/resumes'
import { apiDelete, apiDownload, apiGet, apiPost, apiUpload } from '@/services/api'

export type ResumeListItem = {
  id: string
  originalFilename: string
  status: string
  fileSize: number
  isDefault: boolean
  createdAt: string
}

export type ResumeAnalysis = {
  id: string
  status: string
  extractedText: string
  structuredData: Record<string, unknown>
  warnings: Array<{ field: string; message: string; severity: string }>
  confidence?: string
}

export async function getResumes(): Promise<ResumeListItem[]> {
  const data = await apiGet<unknown>('/api/resumes')
  return resumeListItemSchema.array().parse(data) as ResumeListItem[]
}

export async function uploadResume(file: File): Promise<{ resume: ResumeListItem; analysis: { id: string; status: string } | null }> {
  const form = new FormData()
  form.append('file', file, file.name)
  const data = await apiUpload<unknown>('/api/resumes', form)
  return resumeUploadSchema.parse(data) as {
    resume: ResumeListItem
    analysis: { id: string; status: string } | null
  }
}

export async function deleteResume(id: string): Promise<void> {
  await apiDelete<unknown>(`/api/resumes/${id}`)
}

export async function setDefaultResume(id: string): Promise<void> {
  await apiPost<unknown>(`/api/resumes/${id}/default`)
}

export async function analyzeResume(id: string): Promise<{ success: boolean; analysisId: string }> {
  const data = await apiPost<unknown>(`/api/resumes/${id}/analyze`)
  return data as { success: boolean; analysisId: string }
}

export async function getResumeAnalysis(id: string): Promise<ResumeAnalysis> {
  const data = await apiGet<unknown>(`/api/resumes/${id}/analysis`)
  return resumeAnalysisSchema.parse(data) as ResumeAnalysis
}

export async function retryResumeAnalysis(id: string): Promise<{ success: boolean; analysisId: string }> {
  const data = await apiPost<unknown>(`/api/resumes/${id}/analysis/retry`)
  return data as { success: boolean; analysisId: string }
}

export interface ResumeImportResult {
  imported: string[]
  skipped: string[]
  conflicts: string[]
  applied: string[]
  removed: string[]
}

export type ImportMode = 'fill' | 'select' | 'review'

export interface ResumeImportOptions {
  excludeSkills?: string[]
  includeReview?: string[]
  mode?: ImportMode
  skillsMode?: 'merge' | 'replace'
  removeSkills?: string[]
  expected?: Record<string, unknown>
  confirmReplace?: boolean
}

export type AnalyzedSkill = {
  name: string
  confidence?: string
  source?: string
  evidence?: string
  section?: string
  method?: string
  reviewStatus?: string
  rating?: string
  category?: string
  proficiency?: string
}

export type ReviewCandidate = {
  text: string
  reason: string
  section?: string
}

export async function importResumeToProfile(
  id: string,
  fields: string[],
  opts: ResumeImportOptions = {},
): Promise<ResumeImportResult> {
  const body: Record<string, unknown> = { fields }
  for (const key of ['excludeSkills', 'includeReview', 'mode', 'skillsMode', 'removeSkills', 'expected', 'confirmReplace'] as const) {
    const value = opts[key]
    if (value !== undefined && !(Array.isArray(value) && value.length === 0)) {
      body[key] = value
    }
  }
  const data = await apiPost<unknown>(`/api/resumes/${id}/import`, body)
  return data as ResumeImportResult
}

/** Binary download of the stored file via the authenticated backend route. */
export async function downloadResumeFile(id: string): Promise<{ blob: Blob; filename: string; contentType: string }> {
  return apiDownload(`/api/resumes/${id}/download`)
}
