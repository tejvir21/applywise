/** usePrioritizedJobs hook tests (Phase 8.3.12).
 *
 * The service layer is mocked so no HTTP fetch is involved; readiness is
 * resolved through a synchronous query-result object.
 */

import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrioritizedJobs } from '@/hooks/useProfile'
import { getPrioritizedJobs, type PrioritizedJobsPage } from '@/services/jobs'

vi.mock('@/services/jobs', () => ({
  getPrioritizedJobs: vi.fn(),
}))

const PRIORITIZED_PAGE: PrioritizedJobsPage = {
  jobs: [
    {
      id: 'job-1',
      title: 'Senior Software Engineer',
      companyName: 'TechCorp',
      matchScore: 92,
      eligible: true,
      priority: 'HIGH_PRIORITY',
      priorityReasons: [
        'Strong existing job match',
        'Profile readiness requirements satisfied',
      ],
      readiness: {
        ready: true,
        missingRequiredProfileFields: [],
        missingRecommendedProfileFields: [],
        matchedSkills: ['TypeScript'],
        missingSkills: [],
      },
    },
    {
      id: 'job-2',
      title: 'Staff Accountant',
      companyName: 'Ledger Co',
      matchScore: 20,
      eligible: true,
      priority: 'LOW_MATCH',
      priorityReasons: ['Match below strong threshold'],
      readiness: {
        ready: false,
        missingRequiredProfileFields: [],
        missingRecommendedProfileFields: ['experience'],
        matchedSkills: [],
        missingSkills: ['SAP'],
      },
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('usePrioritizedJobs', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(getPrioritizedJobs).mockReset()
  })

  it('calls the prioritized jobs service with correct filters', async () => {
    vi.mocked(getPrioritizedJobs).mockResolvedValue(PRIORITIZED_PAGE)
    const wrapper = makeWrapper()
    const { result } = renderHook(
      () => usePrioritizedJobs({ minScore: 50, page: 1, pageSize: 20 }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(vi.mocked(getPrioritizedJobs)).toHaveBeenCalledWith({
      minScore: 50,
      page: 1,
      pageSize: 20,
    })
    expect(result.current.data).toEqual(PRIORITIZED_PAGE)
  })

  it('starts in a pending state and resolves with prioritized jobs', async () => {
    vi.mocked(getPrioritizedJobs).mockResolvedValue(PRIORITIZED_PAGE)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePrioritizedJobs(), { wrapper })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.jobs).toHaveLength(2)
  })

  it('invokes the prioritized jobs service even when it rejects', async () => {
    vi.mocked(getPrioritizedJobs).mockRejectedValue(new Error('service down'))
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePrioritizedJobs(), { wrapper })
    await waitFor(() => expect(vi.mocked(getPrioritizedJobs)).toHaveBeenCalled())
    expect(result.current.data).toBeUndefined()
  })

  it('refetches prioritized jobs when refresh is triggered', async () => {
    vi.mocked(getPrioritizedJobs).mockResolvedValue(PRIORITIZED_PAGE)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => usePrioritizedJobs(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const before = vi.mocked(getPrioritizedJobs).mock.calls.length
    await act(async () => {
      await result.current.refetch()
    })
    expect(vi.mocked(getPrioritizedJobs).mock.calls.length).toBeGreaterThan(before)
  })
})
