/** Job-specific profile readiness hook tests (Phase 8.3.11).
 *
 * The service layer is mocked so no HTTP fetch is involved; readiness is
 * resolved through a synchronous query-result object where async behaviour
 * cannot be observed reliably in this environment.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useJobProfileReadiness } from '@/hooks/useProfile'
import { getJobProfileReadiness } from '@/services/profile'

vi.mock('@/services/profile', () => ({
  getJobProfileReadiness: vi.fn(),
}))

const READINESS = {
  ready: true,
  missingRequiredProfileFields: [],
  missingRecommendedProfileFields: [],
  matchedSkills: ['TypeScript'],
  missingSkills: [],
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useJobProfileReadiness', () => {
  afterEach(() => {
    vi.mocked(getJobProfileReadiness).mockReset()
  })

  it('calls the readiness service with the correct job id', async () => {
    vi.mocked(getJobProfileReadiness).mockResolvedValue(READINESS)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useJobProfileReadiness('job-1'), { wrapper })
    await act(async () => {})
    await waitFor(() =>
      expect(vi.mocked(getJobProfileReadiness)).toHaveBeenCalledWith('job-1'),
    )
    expect(result.current.data).toEqual(READINESS)
  })

  it('does not execute the query without a job id', () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useJobProfileReadiness(undefined), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(vi.mocked(getJobProfileReadiness)).not.toHaveBeenCalled()
  })

  it('starts in a pending state and resolves with readiness data', async () => {
    vi.mocked(getJobProfileReadiness).mockResolvedValue(READINESS)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useJobProfileReadiness('job-1'), { wrapper })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(READINESS)
  })

  it('invokes the readiness service even when it rejects', async () => {
    vi.mocked(getJobProfileReadiness).mockRejectedValue(new Error('service down'))
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useJobProfileReadiness('job-1'), { wrapper })
    await waitFor(() => expect(vi.mocked(getJobProfileReadiness)).toHaveBeenCalledWith('job-1'))
    expect(result.current.data).toBeUndefined()
  })

  it('refetches readiness when refresh is triggered', async () => {
    vi.mocked(getJobProfileReadiness).mockResolvedValue(READINESS)
    const wrapper = makeWrapper()
    const { result } = renderHook(() => useJobProfileReadiness('job-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const before = vi.mocked(getJobProfileReadiness).mock.calls.length
    await act(async () => {
      await result.current.refetch()
    })
    expect(vi.mocked(getJobProfileReadiness).mock.calls.length).toBeGreaterThan(before)
  })
})
