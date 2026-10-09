import { useQuery } from '@tanstack/react-query'
import { getJob } from '@/services/jobs'
import { getResumeAnalysis, getResumes } from '@/services/resumes'

export function useJob(jobId: string) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    retry: 1,
  })
}

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: getResumes,
    retry: 1,
  })
}

export function useResumeAnalysis(resumeId: string | null) {
  return useQuery({
    queryKey: ['resume-analysis', resumeId],
    queryFn: () => getResumeAnalysis(resumeId as string),
    enabled: !!resumeId,
    retry: 1,
  })
}
