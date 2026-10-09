import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchExplanation, MatchScoreBadge } from '@/components/MatchExplanation'
import { JobsPage } from '@/pages/JobsPage'
import { getJobMatches } from '@/services/jobs'
import type { JobMatchExplanation, JobMatchesPage } from '@/types/api'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const MATCH: JobMatchExplanation = {
  score: 71,
  eligible: true,
  eligibilityReasons: [],
  factors: [
    {
      key: 'skillsRequired',
      label: 'Required skills',
      weight: 25,
      evaluable: true,
      score: 100,
      countedWeight: 25,
      detail: '2 of 2 required skills verified in profile',
      matched: ['typescript', 'node.js'],
      mismatched: [],
    },
    {
      key: 'salary',
      label: 'Salary',
      weight: 5,
      evaluable: false,
      score: null,
      countedWeight: 0,
      detail: 'Salary unknown on one side, or currency/period differs',
      matched: [],
      mismatched: [],
    },
  ],
  missingData: ['salary expectations unknown or incomparable'],
  evaluatedWeight: 35,
}

const PAGE: JobMatchesPage = {
  matches: [
    {
      id: 'job-1',
      title: 'Senior Software Engineer',
      companyName: 'TechCorp',
      location: 'San Francisco, CA',
      source: 'mock',
      matchScore: 92,
      eligible: true,
    },
    {
      id: 'job-2',
      title: 'Staff Accountant',
      companyName: 'Evil Corp',
      matchScore: 20,
      eligible: false,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  scanned: 2,
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

function renderJobsPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>,
  )
}

describe('getJobMatches', () => {
  it('parses a ranked matches page', async () => {
    stubFetch({ success: true, data: PAGE })
    await expect(getJobMatches({ minScore: 50 })).resolves.toEqual(PAGE)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/matches?minScore=50'),
      expect.anything(),
    )
  })

  it('throws from an error envelope', async () => {
    stubFetch({ success: false, error: { code: 'NOT_FOUND', message: 'No profile', details: {} } }, 404)
    await expect(getJobMatches()).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })
})

describe('MatchScoreBadge', () => {
  it('labels strong, partial, and poor bands without implying submission odds', () => {
    const { rerender } = render(<MatchScoreBadge score={92} />)
    expect(screen.getByLabelText(/92 out of 100 \(strong match\)/)).toBeInTheDocument()

    rerender(<MatchScoreBadge score={71} />)
    expect(screen.getByLabelText(/71 out of 100 \(partial match\)/)).toBeInTheDocument()

    rerender(<MatchScoreBadge score={20} />)
    expect(screen.getByLabelText(/20 out of 100 \(poor match\)/)).toBeInTheDocument()
    expect(screen.queryByText(/interview/i)).not.toBeInTheDocument()
  })
})

describe('MatchExplanation', () => {
  it('renders factors, missing data, and eligibility warnings', () => {
    const ineligible = { ...MATCH, eligible: false, eligibilityReasons: ["Company 'Evil Corp' is on your excluded list"] }
    render(<MatchExplanation match={ineligible} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Evil Corp')
    expect(screen.getByText('Required skills')).toBeInTheDocument()
    expect(screen.getByText('2 of 2 required skills verified in profile')).toBeInTheDocument()
    expect(screen.getByText(/Matched: typescript, node.js/)).toBeInTheDocument()
    expect(screen.getByText('Salary')).toBeInTheDocument()
    expect(screen.getByText('unknown')).toBeInTheDocument()
    expect(screen.getByText('Missing or unknown data')).toBeInTheDocument()
    expect(screen.getByText(/35% of the weighting/)).toBeInTheDocument()
    expect(screen.getByText(/not a probability of receiving an interview/)).toBeInTheDocument()
  })
})

describe('JobsPage', () => {
  it('lists ranked matches with scores and filters by minimum score', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PAGE })
    renderJobsPage()

    expect(await screen.findByText('Senior Software Engineer')).toBeInTheDocument()
    expect(screen.getByText('Staff Accountant')).toBeInTheDocument()
    expect(screen.getByText(/92 \/ 100/)).toBeInTheDocument()
    expect(screen.getByText('eligibility warning')).toBeInTheDocument()
    expect(screen.getByText(/Showing 2 of 2 ranked matches/)).toBeInTheDocument()

    stubFetch({ success: true, data: { ...PAGE, matches: [PAGE.matches[0]], total: 1 } })
    await user.clear(screen.getByLabelText('Minimum match score'))
    await user.type(screen.getByLabelText('Minimum match score'), '80')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('minScore=80'),
        expect.anything(),
      )
    })
  })

  it('shows an empty state when nothing matches', async () => {
    stubFetch({ success: true, data: { ...PAGE, matches: [], total: 0 } })
    renderJobsPage()

    expect(await screen.findByText('No matches yet')).toBeInTheDocument()
  })

  it('shows an error state with retry when loading fails', async () => {
    stubFetch({ success: false, error: { code: 'UNAUTHORIZED', message: 'Nope', details: {} } }, 401)
    renderJobsPage()

    // The query retries once before surfacing the error; allow time for it.
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toHaveTextContent('Could not load matches')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('expands the match explanation on demand', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: PAGE })
    renderJobsPage()
    await screen.findByText('Senior Software Engineer')

    stubFetch({ success: true, data: { job: { id: 'job-1' }, match: MATCH } })
    await user.click(screen.getAllByRole('button', { name: 'Why this score?' })[0])

    expect(await screen.findByText('2 of 2 required skills verified in profile')).toBeInTheDocument()
  })
})
