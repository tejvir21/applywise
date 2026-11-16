import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createProfile,
  updateProfile,
  addProfileSkill,
  removeProfileSkill,
  savePreferences,
  getPreferences,
  getProfile,
  getProfileReadiness,
  getJobProfileReadiness,
} from '@/services/profile'
import { getPrioritizedJobs } from '@/services/jobs'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    retry: 1,
  })
}

export function useProfileReadiness() {
  return useQuery({
    queryKey: ['profile-readiness'],
    queryFn: getProfileReadiness,
    retry: 1,
  })
}

export function useJobProfileReadiness(jobId: string | null | undefined) {
  return useQuery({
    queryKey: ['job-profile-readiness', jobId],
    queryFn: () => getJobProfileReadiness(jobId as string),
    enabled: !!jobId,
    retry: 1,
  })
}

export function usePrioritizedJobs(filters: { minScore?: number; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ['prioritized-jobs', filters.minScore ?? 0, filters.page ?? 1, filters.pageSize ?? 20],
    queryFn: () => getPrioritizedJobs(filters),
    retry: 1,
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    retry: 1,
  })
}

function invalidateReadiness(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['profile'] })
  queryClient.invalidateQueries({ queryKey: ['profile-readiness'] })
  queryClient.invalidateQueries({ queryKey: ['job-profile-readiness'] })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => updateProfile(body),
    onSuccess: () => invalidateReadiness(queryClient),
  })
}

export function useCreateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => createProfile(body),
    onSuccess: () => invalidateReadiness(queryClient),
  })
}

export function useAddProfileSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skill: { name: string; level?: string }) => addProfileSkill(skill),
    onSuccess: () => invalidateReadiness(queryClient),
  })
}

export function useRemoveProfileSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (skillId: string) => removeProfileSkill(skillId),
    onSuccess: () => invalidateReadiness(queryClient),
  })
}

export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => savePreferences(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      invalidateReadiness(queryClient)
    },
  })
}
