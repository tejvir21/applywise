/** React Query hooks for browser automation (Phase 9.1). */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAutomationExecution,
  listAutomationExecutions,
  getAutomationExecution,
  updateAutomationAnswers,
  reviewAutomationExecution,
  pauseAutomationExecution,
  resumeAutomationExecution,
  cancelAutomationExecution,
  getAutomationEvidence,
  type AutomationExecution,
  type AutomationExecutionsPage,
} from '@/services/automation'

export function useAutomationExecution(executionId: string | null | undefined) {
  return useQuery<AutomationExecution>({
    queryKey: ['automation-execution', executionId],
    queryFn: () => getAutomationExecution(executionId as string),
    enabled: !!executionId,
    retry: 1,
  })
}

export function useAutomationExecutions(options?: { page?: number; pageSize?: number }) {
  return useQuery<AutomationExecutionsPage>({
    queryKey: ['automation-executions', options?.page ?? 1, options?.pageSize ?? 20],
    queryFn: () => listAutomationExecutions(options),
    retry: 1,
  })
}

export function useCreateAutomationExecution() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, { applicationUrl: string; jobId?: string; preparationId?: string; platform?: string }>({
    mutationFn: (body) => createAutomationExecution(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-executions'] })
    },
  })
}

export function useUpdateAutomationAnswers() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, { executionId: string; answers: Array<{ fieldId: string; value: string }> }>({
    mutationFn: ({ executionId, answers }) => updateAutomationAnswers(executionId, answers),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-execution', variables.executionId] })
    },
  })
}

export function useReviewAutomationExecution() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, { executionId: string; approved: boolean }>({
    mutationFn: ({ executionId, approved }) => reviewAutomationExecution(executionId, approved),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-execution', variables.executionId] })
    },
  })
}

export function usePauseAutomationExecution() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, { executionId: string; reason?: string }>({
    mutationFn: ({ executionId, reason }) => pauseAutomationExecution(executionId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-execution', variables.executionId] })
    },
  })
}

export function useResumeAutomationExecution() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, { executionId: string }>({
    mutationFn: ({ executionId }) => resumeAutomationExecution(executionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-execution', variables.executionId] })
      queryClient.invalidateQueries({ queryKey: ['automation-executions'] })
    },
  })
}

export function useCancelAutomationExecution() {
  const queryClient = useQueryClient()
  return useMutation<AutomationExecution, Error, string>({
    mutationFn: (executionId) => cancelAutomationExecution(executionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-execution', variables] })
      queryClient.invalidateQueries({ queryKey: ['automation-executions'] })
    },
  })
}

export function useAutomationEvidence(executionId: string | null | undefined) {
  return useQuery<AutomationExecution>({
    queryKey: ['automation-evidence', executionId],
    queryFn: () => getAutomationEvidence(executionId as string),
    enabled: !!executionId,
    retry: 1,
  })
}