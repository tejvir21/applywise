/** Profile readiness component integration tests (Phase 8.3.9). */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ProfileReadiness } from '@/components/ProfileReadiness'

vi.mock('@/hooks/useProfile', () => ({
  useProfileReadiness: vi.fn(),
}))

import { useProfileReadiness } from '@/hooks/useProfile'

const readiness = (overrides: Record<string, unknown> = {}) => {
  const data = {
    userId: 'u1',
    status: 'needs_work',
    percentage: 60,
    completedSections: ['personal'],
    incompleteSections: ['professional', 'skills'],
    details: {
      personal: { completed: true, missing: [] },
      professional: { completed: false, missing: ['headline'] },
      skills: { completed: false, missing: ['skills'] },
    },
    resumeAvailable: false,
    missingRequired: ['headline'],
    missingRecommended: ['experience'],
    optional: ['certifications'],
    recommendations: ['Add a professional headline.'],
    ...overrides,
  }
  return {
    data,
    isError: false,
    error: null,
    isPending: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    isPlaceholderData: false,
    status: 'success' as const,
    fetchStatus: 'idle' as const,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useProfileReadiness>
}

const renderReadiness = (overrides: Record<string, unknown> = {}) => {
  vi.mocked(useProfileReadiness).mockReturnValue(readiness(overrides))
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfileReadiness />
    </MemoryRouter>
  )
}

describe('ProfileReadiness', () => {
  beforeEach(() => {
    vi.mocked(useProfileReadiness).mockResolvedValue(undefined as never)
  })

  it('renders readiness percentage and status', async () => {
    vi.mocked(useProfileReadiness).mockResolvedValue(readiness({ percentage: 60, status: 'needs_work' }))
    render(<MemoryRouter initialEntries={['/profile']}><ProfileReadiness /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/60% complete/)).toBeInTheDocument())
    expect(screen.getByText('Needs work')).toBeInTheDocument()
  })

  it('renders missing required and recommended fields', async () => {
    renderReadiness()
    await waitFor(() => expect(screen.getByText('Professional headline')).toBeInTheDocument())
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('shows resume unavailable and offers upload link when no resume', async () => {
    renderReadiness({ resumeAvailable: false })
    await waitFor(() => expect(screen.getByText('Resume')).toBeInTheDocument())
    expect(screen.getByText('No resume on file.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload resume' })).toBeInTheDocument()
  })

  it('shows resume available when present', async () => {
    renderReadiness({ resumeAvailable: true })
    await waitFor(() => expect(screen.getByText('A resume is available.')).toBeInTheDocument())
  })

  it('renders recommendations', async () => {
    renderReadiness()
    await waitFor(() => expect(screen.getByText('Add a professional headline.')).toBeInTheDocument())
  })

  it('shows ready status when profile is complete', async () => {
    renderReadiness({ status: 'ready', percentage: 100 })
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument())
    expect(screen.getByText('100% complete')).toBeInTheDocument()
  })

  it('shows no_profile state', async () => {
    renderReadiness({ status: 'no_profile', percentage: 0 })
    await waitFor(() => expect(screen.getByText('Not started')).toBeInTheDocument())
    expect(screen.getByText('0% complete')).toBeInTheDocument()
  })

  it('shows error state when the API fails', async () => {
    vi.mocked(useProfileReadiness).mockRejectedValue(new Error('boom'))
    render(<MemoryRouter initialEntries={['/profile']}><ProfileReadiness /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Could not load readiness/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('refreshes readiness when refresh is clicked', async () => {
    vi.mocked(useProfileReadiness).mockResolvedValue(readiness({ percentage: 60 }))
    render(<MemoryRouter initialEntries={['/profile']}><ProfileReadiness /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/60% complete/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByText(/80% complete/)).toBeInTheDocument())
  })
})
