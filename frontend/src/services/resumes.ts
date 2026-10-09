import { resumeAnalysisSchema, resumeListItemSchema, resumeUploadSchema } from '@/schemas/resumes'
import { apiDelete, apiGet, apiPost, apiUpload } from '@/services/api'

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
