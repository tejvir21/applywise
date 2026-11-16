/** Job-specific profile readiness component tests (Phase 8.3.11).
 *
 * The useJobProfileReadiness hook is mocked with a synchronous query-result
 * object (per project guidance: not a Promise), so rendering is fully
 * synchronous and no HTTP fetch is involved.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useJobProfileReadiness } from '@/hooks/useProfile'
import { JobProfileReadiness } from '@/components/JobProfileReadiness'
import type { JobProfileReadiness as JobProfileReadinessData } from '@/services/profile'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/useProfile', () => ({
  useJobProfileReadiness: vi.fn(),
}))

function LocationDisplay() {
  const { pathname } = useLocation()
  return <div data-testid="current-location">{pathname}</div>
}

type ReadinessQueryResult = UseQueryResult<JobProfileReadinessData, Error>

type ReadinessResultOverrides = {
  data?: Partial<JobProfileReadinessData>
  isPending?: boolean
  isError?: boolean
  error?: Error | null
  isSuccess?: boolean
  isFetching?: boolean
  refetch?: ReturnType<typeof vi.fn>
}

const readinessResult = (overrides: ReadinessResultOverrides = {}): ReadinessQueryResult => {
  const data: JobProfileReadinessData = {
    ready: false,
    missingRequiredProfileFields: ['personal', 'professional', 'skills'],
    missingRecommendedProfileFields: ['experience', 'education'],
    matchedSkills: ['TypeScript'],
    missingSkills: ['Go', 'Rust'],
    ...(overrides.data ?? {}),
  }
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    isSuccess: true,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReadinessQueryResult
}

function renderWithLocation(jobId: string, result: ReadinessQueryResult) {
  vi.mocked(useJobProfileReadiness).mockReturnValue(result)
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}`]}>
      <LocationDisplay />
      <JobProfileReadiness jobId={jobId} />
    </MemoryRouter>,
  )
}

describe('JobProfileReadiness', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(useJobProfileReadiness).mockReset()
  })

  it('requests readiness for the viewed job id', () => {
    renderWithLocation('job-1', readinessResult())
    expect(vi.mocked(useJobProfileReadiness)).toHaveBeenCalledWith('job-1')
  })

  it('does not render readiness without a job id', () => {
    vi.mocked(useJobProfileReadiness).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      isSuccess: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReadinessQueryResult)
    render(
      <MemoryRouter initialEntries={['/jobs/']}>
        <JobProfileReadiness jobId="" />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Job profile readiness')).not.toBeInTheDocument()
    expect(screen.queryByText(/Loading readiness/)).not.toBeInTheDocument()
  })

  it('shows a loading state while readiness is fetching', () => {
    renderWithLocation('job-1', readinessResult({ data: undefined, isPending: true }))
    expect(screen.getByText(/Loading readiness/)).toBeInTheDocument()
  })

  it('shows an error state with a Retry action', () => {
    const refetch = vi.fn()
    renderWithLocation('job-1', readinessResult({ data: undefined, isPending: false, isError: true, refetch }))
    expect(screen.getByText(/Could not load readiness/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows the ready state when the backend reports ready', () => {
    renderWithLocation('job-1', readinessResult({ data: { ready: true, missingSkills: [] } }))
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('You meet the readiness conditions for this job.')).toBeInTheDocument()
  })

  it('shows the not-ready state when the backend reports not ready', () => {
    renderWithLocation('job-1', readinessResult({ data: { ready: false } }))
    expect(screen.getByText('Not ready')).toBeInTheDocument()
    expect(screen.getByText('You are missing some items before applying to this job.')).toBeInTheDocument()
  })

  it('lists incomplete required profile fields', () => {
    renderWithLocation('job-1', readinessResult())
    expect(screen.getByText('Required profile information')).toBeInTheDocument()
    expect(screen.getByText('Personal information')).toBeInTheDocument()
    expect(screen.getByText('Professional summary')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('lists missing recommended fields separately from required fields', () => {
    renderWithLocation('job-1', readinessResult())
    expect(screen.getByText('Recommended profile information')).toBeInTheDocument()
    expect(screen.getByText('Work experience')).toBeInTheDocument()
    expect(screen.getByText('Education')).toBeInTheDocument()
  })

  it('shows matched skills with distinct styling', () => {
    renderWithLocation('job-1', readinessResult())
    expect(screen.getByText('Matched skills')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('shows missing skills with distinct styling', () => {
    renderWithLocation('job-1', readinessResult())
    expect(screen.getByText('Missing skills')).toBeInTheDocument()
    expect(screen.getByText('Go')).toBeInTheDocument()
    expect(screen.getByText('Rust')).toBeInTheDocument()
  })

  it('handles empty sections without showing empty warnings', () => {
    renderWithLocation('job-1', readinessResult({
      data: {
        ready: true,
        missingRequiredProfileFields: [],
        missingRecommendedProfileFields: [],
        matchedSkills: [],
        missingSkills: [],
      },
    }))
    expect(screen.queryByText('Required profile information')).not.toBeInTheDocument()
    expect(screen.queryByText('Recommended profile information')).not.toBeInTheDocument()
    expect(screen.getByText('No required job skills matched yet.')).toBeInTheDocument()
    expect(screen.getByText('No missing required skills.')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('navigates to the profile section for a missing required field', () => {
    renderWithLocation('job-1', readinessResult())
    expect(screen.getByTestId('current-location').textContent).toBe('/jobs/job-1')
    fireEvent.click(screen.getAllByRole('button', { name: /Go to section/ })[0])
    expect(screen.getByTestId('current-location').textContent).toBe('/profile')
  })

  it('navigates to preferences for the preferences section', () => {
    renderWithLocation('job-1', readinessResult({ data: { missingRequiredProfileFields: ['preferences'] } }))
    fireEvent.click(screen.getByRole('button', { name: /Go to section/ }))
    expect(screen.getByTestId('current-location').textContent).toBe('/profile/preferences')
  })

  it('refreshes readiness when Refresh is clicked', () => {
    const refetch = vi.fn()
    renderWithLocation('job-1', readinessResult({ refetch }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('does not show stale data when the job id changes', () => {
    vi.mocked(useJobProfileReadiness).mockReturnValue(
      readinessResult({ data: { ready: true, missingSkills: [], matchedSkills: ['TypeScript'] } }),
    )
    const { rerender } = render(
      <MemoryRouter initialEntries={['/jobs/job-1']}>
        <LocationDisplay />
        <JobProfileReadiness jobId="job-1" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()

    vi.mocked(useJobProfileReadiness).mockReturnValue(
      readinessResult({ data: { ready: false, missingSkills: ['Go'], matchedSkills: [] } }),
    )
    rerender(
      <MemoryRouter initialEntries={['/jobs/job-2']}>
        <LocationDisplay />
        <JobProfileReadiness jobId="job-2" />
      </MemoryRouter>,
    )
    expect(vi.mocked(useJobProfileReadiness)).toHaveBeenLastCalledWith('job-2')
    expect(screen.getByText('Not ready')).toBeInTheDocument()
    expect(screen.getByText('Go')).toBeInTheDocument()
    expect(screen.queryByText('TypeScript')).not.toBeInTheDocument()
  })
})
