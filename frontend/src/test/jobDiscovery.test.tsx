import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobDiscoveryPanel } from '@/components/JobDiscoveryPanel'
import { searchDiscoveredJobs } from '@/services/discovery'
import type { DiscoveryPage } from '@/types/api'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const PAGE: DiscoveryPage = {
  jobs: [
    {
      dedupeKey: 'greenhouse:groww:1',
      externalId: '1',
      canonicalUrl: 'https://job-boards.greenhouse.io/groww/jobs/1',
      applicationUrl: 'https://job-boards.greenhouse.io/groww/jobs/1',
      title: 'Frontend Engineer',
      companyName: 'Groww',
      location: 'Bengaluru, India',
      countryIso: 'IN',
      remoteType: 'onsite',
      remoteEligibility: 'onsite',
      indiaEligible: true,
      sourceName: 'greenhouse:groww',
      sourceProvider: 'greenhouse',
      sourceDisplayName: 'Groww (greenhouse)',
      discoveredViaQuery: 'React Developer',
      postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      fetchedAt: new Date().toISOString(),
      dateConfidence: 'reliable',
      isNewWithin7: true,
    },
    {
      dedupeKey: 'greenhouse:groww:2',
      externalId: '2',
      canonicalUrl: 'https://job-boards.greenhouse.io/groww/jobs/2',
      title: 'Backend Engineer',
      companyName: 'Groww',
      location: 'Pune, India',
      indiaEligible: true,
      sourceName: 'greenhouse:groww',
      sourceProvider: 'greenhouse',
      sourceDisplayName: 'Groww (greenhouse)',
      postedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      fetchedAt: new Date().toISOString(),
      dateConfidence: 'reliable',
      olderListing: true,
    },
    {
      dedupeKey: 'muse:3',
      externalId: '3',
      canonicalUrl: 'https://themuse.com/jobs/3',
      title: 'ML Engineer',
      companyName: 'Somewhere',
      location: 'Remote',
      indiaEligible: false,
      sourceName: 'muse',
      sourceProvider: 'muse',
      sourceDisplayName: 'The Muse (public API)',
      fetchedAt: new Date().toISOString(),
      dateConfidence: 'unavailable',
    },
  ],
  totalUnique: 3,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  queries: ['React Developer', 'Frontend Developer'],
  within7Count: 1,
  olderCount: 1,
  undatedCount: 1,
  excluded: { duplicates: 1, relevance: 5, geo: 2, freshness: 0 },
  sources: [
    {
      sourceName: 'greenhouse:groww',
      sourceProvider: 'greenhouse',
      sourceDisplayName: 'Groww (greenhouse)',
      state: 'connected_with_results',
      fetchedCount: 3,
      pagesFetched: 1,
    },
    {
      sourceName: 'adzuna',
      sourceProvider: 'adzuna',
      sourceDisplayName: 'Adzuna',
      state: 'not_configured',
      fetchedCount: 0,
      pagesFetched: 0,
      error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set',
    },
  ],
  fetchedAt: new Date().toISOString(),
  hasMore: false,
}

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      json: async () => payload,
    }),
  )
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <JobDiscoveryPanel />
    </QueryClientProvider>,
  )
}

describe('searchDiscoveredJobs', () => {
  it('builds the query string and parses the page', async () => {
    stubFetch({ success: true, data: PAGE })
    const page = await searchDiscoveredJobs({ roles: 'React Developer', location: 'India', freshness: 'last7', sort: 'newest' })
    expect(page.totalUnique).toBe(3)
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).toContain('/api/jobs/search')
    expect(url).toContain('roles=React+Developer')
    expect(url).toContain('location=India')
    expect(url).toContain('freshness=last7')
    expect(url).toContain('sort=newest')
  })

  it('omits default freshness/sort', async () => {
    stubFetch({ success: true, data: PAGE })
    await searchDiscoveredJobs({ roles: 'React Developer' })
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    expect(url).not.toContain('freshness')
    expect(url).not.toContain('sort=')
  })

  it('throws from an error envelope', async () => {
    stubFetch({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a role', details: {} } }, 422)
    await expect(searchDiscoveredJobs({ roles: '' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 })
  })
})

describe('JobDiscoveryPanel', () => {
  it('shows fetched count, per-source state, and distinct dates', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PAGE })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByTestId('result-count')).toHaveTextContent('3 unique listings')
    // Distinct last-fetched timestamp (not conflated with posting dates).
    expect(screen.getByText(/Last fetched/)).toBeInTheDocument()
    // Distinct source states.
    expect(screen.getByText(/Groww \(greenhouse\): results \(3\)/)).toBeInTheDocument()
    expect(screen.getByText(/Adzuna: not configured/)).toBeInTheDocument()
    // Freshness badges.
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Older listing')).toBeInTheDocument()
    // Undated listing labeled honestly; posting vs update vs fetch kept distinct.
    expect(screen.getByText('Posting date unavailable')).toBeInTheDocument()
    expect(screen.getByText(/updated/)).toBeInTheDocument()
    expect(screen.getByText(/India eligibility unknown/)).toBeInTheDocument()
    // Original application URL preserved.
    expect(screen.getByRole('link', { name: 'Apply at source' })).toHaveAttribute(
      'href',
      'https://job-boards.greenhouse.io/groww/jobs/1',
    )
    // No "Load more" when there are no more pages.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('does not search until the user chooses Search', async () => {
    stubFetch({ success: true, data: PAGE })
    renderPanel()
    expect(screen.queryByTestId('result-count')).not.toBeInTheDocument()
    expect(screen.getByText(/choose.*Search.*to find live jobs/i)).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('suggests broadening when there are no results', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: { ...PAGE, jobs: [], totalUnique: 0, sources: [PAGE.sources[0]] } })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No live listings matched.')).toBeInTheDocument()
    expect(screen.getByText(/Broaden the role/)).toBeInTheDocument()
  })

  it('shows a "Load more" action when more pages exist and fetches the next page', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: { ...PAGE, hasMore: true, totalPages: 2 } })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByTestId('result-count')

    const loadMore = screen.getByRole('button', { name: 'Load more' })
    stubFetch({ success: true, data: { ...PAGE, page: 2, jobs: [] } })
    await user.click(loadMore)
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.anything())
    })
  })

  it('re-searches when the freshness filter changes', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PAGE })
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByTestId('result-count')

    await user.selectOptions(screen.getByLabelText('Freshness'), 'last14')
    stubFetch({ success: true, data: { ...PAGE, queries: PAGE.queries } })
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(expect.stringContaining('freshness=last14'), expect.anything())
    })
  })
})
