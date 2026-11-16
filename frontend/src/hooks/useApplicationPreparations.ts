/** React Query hooks for application preparation (Phase 8.3.13). */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  startPreparation,
  listPreparations,
  getPreparation,
  savePreparation,
  generateTailoredResume,
  generateCoverLetter,
  generateAnswers,
  updateAnswer,
  reviewPreparation,
  cancelPreparation,
  reopenPreparation,
  type PreparationStatus,
  type ApplicationPreparation,
  type PreparationsPage,
  type StartPreparationResult,
} from '@/services/application-preparations'

export function usePreparations(options?: {
  status?: PreparationStatus
  page?: number
  pageSize?: number
  query?: string
}) {
  return useQuery<PreparationsPage>({
    queryKey: [
      'preparations',
      options?.status ?? '',
      options?.page ?? 1,
      options?.pageSize ?? 20,
      options?.query ?? '',
    ],
    queryFn: () => listPreparations(options),
    retry: 1,
  })
}

export function usePreparation(preparationId: string | null | undefined) {
  return useQuery<ApplicationPreparation>({
    queryKey: ['preparation', preparationId],
    queryFn: () => getPreparation(preparationId as string),
    enabled: !!preparationId,
    retry: 1,
  })
}

export function useStartPreparation() {
  const queryClient = useQueryClient()
  return useMutation<StartPreparationResult, Error, { jobId: string; resumeId?: string }>({
    mutationFn: ({ jobId, resumeId }) => startPreparation(jobId, resumeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useGenerateTailoredResume() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ preparationId, replace }: { preparationId: string; replace?: boolean }) =>
      generateTailoredResume(preparationId, { replace }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useGenerateCoverLetter() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ preparationId, replace }: { preparationId: string; replace?: boolean }) =>
      generateCoverLetter(preparationId, { replace }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useGenerateAnswers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      preparationId,
      questions,
    }: {
      preparationId: string
      questions: string[]
    }) => generateAnswers(preparationId, questions),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useUpdateAnswer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      preparationId,
      answerId,
      body,
    }: {
      preparationId: string
      answerId: string
      body: {
        answer?: string
        verified?: boolean
        reviewStatus?: 'GENERATED' | 'NEEDS_CANDIDATE_INPUT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED'
        reviewerNote?: string
      }
    }) => updateAnswer(preparationId, answerId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useReviewPreparation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      preparationId,
      body,
    }: {
      preparationId: string
      body: {
        component?: 'tailoredResume' | 'coverLetter' | 'answers' | 'package'
        answerId?: string
        decision?: 'approve' | 'reject'
        note?: string
      }
    }) => reviewPreparation(preparationId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useCancelPreparation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (preparationId: string) => cancelPreparation(preparationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useSavePreparation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      preparationId,
      body,
    }: {
      preparationId: string
      body: { missingInformation?: string[] }
    }) => savePreparation(preparationId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables.preparationId] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}

export function useReopenPreparation() {
  const queryClient = useQueryClient()
  return useMutation<ApplicationPreparation, Error, string>({
    mutationFn: (preparationId: string) => reopenPreparation(preparationId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['preparation', variables] })
      queryClient.invalidateQueries({ queryKey: ['preparations'] })
    },
  })
}
