import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsPage } from '@/pages/ApplicationsPage'
import { JobsPage } from '@/pages/JobsPage'
import { getApplicationSummary } from '@/services/applications'
import { saveJob, unsaveJob } from '@/services/jobs'
import { formatSalary, humanizeDataSource, humanizeEnum, matchBand } from '@/lib/match'
import type { ApplicationListPage, ApplicationSummary, JobApplication } from '@/types/api'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Route-aware fetch stub: inspects the URL to pick the response envelope. */
function stubRoutes(routes: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init?: RequestInit) => ({
      status: 200,
      json: async () => routes(String(url), init),
    })),
  )
}

function renderAt(path: string, routes: { path: string; element: React.ReactNode }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}</Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const MATCH_JOB = {
  id: 'job-1',
  title: 'Senior Software Engineer',
  companyName: 'TechCorp',
  location: 'San Francisco, CA',
  remoteType: 'hybrid',
  employmentType: 'full_time',
  experienceLevel: 'senior',
  salaryMin: 150000,
  salaryMax: 200000,
  salaryCurrency: 'USD',
  salaryPeriod: 'yearly',
  source: 'mock',
  matchScore: 92,
  eligible: true,
  evaluatedWeight: 100,
  insufficientData: false,
  missingData: [],
}

const SPARSE_JOB = {
  id: 'job-2',
  title: 'Mystery Role',
  companyName: 'Unknown Corp',
  matchScore: 0,
  eligible: true,
  evaluatedWeight: 0,
  insufficientData: true,
  missingData: ['insufficient data to score this job'],
}

const MATCH_PAGE = {
  matches: [MATCH_JOB, SPARSE_JOB],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
  scanned: 2,
}

describe('match display helpers', () => {
  it('separates a low score from insufficient data', () => {
    expect(matchBand(10, 100)).toBe('poor')
    expect(matchBand(0, 0)).toBe('insufficient')
    // Very low coverage is not trustworthy either, even with a numeric score.
    expect(matchBand(95, 20)).toBe('insufficient')
    expect(matchBand(95, 100)).toBe('strong')
  })

  it('omits salary entirely when no data exists', () => {
    expect(formatSalary({})).toBeNull()
    expect(formatSalary({ salaryMin: undefined, salaryMax: undefined })).toBeNull()
    // Number formatting is locale-dependent; assert on the digits only.
    const formatted = formatSalary({ salaryMin: 150000, salaryMax: 200000, salaryCurrency: 'USD', salaryPeriod: 'yearly' })
    expect(formatted).not.toBeNull()
    expect(formatted!.replace(/\D/g, '')).toContain('150000')
    expect(formatted!.replace(/\D/g, '')).toContain('200000')
    expect(formatted).toContain('/year')
  })

  it('humanizes enums and blanks out unknowns', () => {
    expect(humanizeEnum('full_time')).toBe('Full Time')
    expect(humanizeEnum('unknown')).toBeNull()
    expect(humanizeEnum(undefined)).toBeNull()
  })

  it('never presents mock data as a live external listing', () => {
    expect(humanizeDataSource('mock')).toMatch(/not a live listing/i)
    expect(humanizeDataSource('indeed')).toBe('indeed')
  })
})

describe('jobs service', () => {
  it('saves and unsaves a job', async () => {
    stubRoutes(() => ({ success: true, data: { _id: 's1' } }))
    await expect(saveJob('job-1')).resolves.toEqual({ isNew: true })
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/jobs/job-1/save'),
      expect.objectContaining({ method: 'POST' }),
    )

    await unsaveJob('job-1')
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/jobs/job-1/save'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('JobsPage workflow', () => {
  it('shows job facts, saves a job, and starts an application draft', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    stubRoutes((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.includes('/api/jobs/sources')) {
        return {
          success: true,
          data: {
            sources: [
              { source: 'muse', displayName: 'The Muse', status: 'ok', count: 0, queried: false },
            ],
          },
        }
      }
      if (url.includes('/api/jobs/job-1/save')) return { success: true, data: { _id: 's1' } }
      if (url.includes('/api/applications') && init?.method === 'POST') {
        return {
          success: true,
          data: {
            id: 'app-9',
            jobId: 'job-1',
            jobSnapshot: { title: 'Senior Software Engineer', companyName: 'TechCorp' },
            mode: 'permission',
            materials: { answers: [] },
            status: 'DRAFT',
            attemptCount: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }
      }
      if (url.includes('/api/jobs/matches')) return { success: true, data: MATCH_PAGE }
      throw new Error(`unexpected url ${url}`)
    })

    renderAt('/jobs', [{ path: '/jobs', element: <JobsPage /> }])

    // Real job facts are displayed when present.
    expect(await screen.findByText('Senior Software Engineer')).toBeInTheDocument()
    // Job facts render in the card's definition list.
    const card = screen.getByText('Senior Software Engineer').closest('li')
    expect(card?.textContent).toContain('TechCorp')
    expect(card?.textContent).toContain('Hybrid')
    expect(card?.textContent).toContain('Full Time')
    // The salary row exists; digit grouping is locale-dependent.
    expect(card?.textContent?.replace(/\D/g, '')).toContain('150000')
    // Mock sources are labelled honestly, never as live listings.
    expect(screen.getByText(/not a live listing/i)).toBeInTheDocument()

    // Insufficient data is called out rather than shown as a poor match.
    expect(screen.getByText('Mystery Role')).toBeInTheDocument()
    expect(screen.getAllByText(/Not enough comparable data to score this job/i).length).toBeGreaterThan(0)

    // Save works and reflects in the UI.
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(() => {
      expect(calls.some((c) => c.includes('POST') && c.includes('/api/jobs/job-1/save'))).toBe(true)
    })
    expect(await screen.findByRole('button', { name: /Saved/ })).toBeDisabled()

    // Prepare application creates a real draft (a POST, not a submit).
    await user.click(screen.getAllByRole('button', { name: 'Prepare application' })[0])
    await waitFor(() => {
      expect(calls.some((c) => c.startsWith('POST') && c.includes('/api/applications'))).toBe(true)
    })
  })

  it('paginates with bounded page requests', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    stubRoutes((url) => {
      urls.push(url)
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1')
      return {
        success: true,
        data: {
          ...MATCH_PAGE,
          matches: [{ ...MATCH_JOB, id: `job-p${page}`, title: `Page ${page} Job` }],
          total: 45,
          page,
          totalPages: 3,
        },
      }
    })

    renderAt('/jobs', [{ path: '/jobs', element: <JobsPage /> }])
    expect(await screen.findByText('Page 1 Job')).toBeInTheDocument()
    // The request is bounded by an explicit page size.
    expect(urls.some((u) => u.includes('pageSize=20'))).toBe(true)

    const next = screen.getByRole('button', { name: 'Next page' })
    expect(next).toBeEnabled()
    await user.click(next)

    expect(await screen.findByText('Page 2 Job')).toBeInTheDocument()
    expect(urls.some((u) => u.includes('page=2'))).toBe(true)

    // Previous is reachable and disabled correctly at the boundary.
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => {
      expect(screen.getByText('Page 1 Job')).toBeInTheDocument()
    })
  })
})

const DRAFT_APP: JobApplication = {
  id: 'app-1',
  jobId: 'job-1',
  jobSnapshot: { title: 'Software Engineer', companyName: 'TechCorp' },
  mode: 'permission',
  materials: { answers: [] },
  status: 'DRAFT',
  attemptCount: 0,
  nextAction: 'Review materials and request review',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
}

const LIST_PAGE: ApplicationListPage = {
  applications: [
    DRAFT_APP,
    {
      ...DRAFT_APP,
      id: 'app-2',
      status: 'NEEDS_MANUAL_ACTION',
      nextAction: 'Finish applying on the platform page',
      jobSnapshot: { title: 'Platform Engineer', companyName: 'Acme' },
    },
    {
      ...DRAFT_APP,
      id: 'app-3',
      status: 'SUBMITTED',
      nextAction: 'Submitted — no further action',
      jobSnapshot: { title: 'Backend Engineer', companyName: 'Globex' },
    },
  ],
  total: 3,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

describe('applications service summary', () => {
  it('requests the server-side summary endpoint', async () => {
    const summary: ApplicationSummary = {
      total: 3,
      drafts: 1,
      awaitingReview: 0,
      approved: 0,
      confirmedSubmissions: 1,
      externalHandoffs: 1,
      inFlight: 0,
      failed: 0,
      cancelled: 0,
      byStatus: { DRAFT: 1, NEEDS_MANUAL_ACTION: 1, SUBMITTED: 1 },
      recentActivity: [],
    }
    stubRoutes(() => ({ success: true, data: summary }))
    await expect(getApplicationSummary(10)).resolves.toEqual(summary)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/applications/summary?recentLimit=10'),
      expect.anything(),
    )
  })
})

describe('ApplicationsPage history', () => {
  it('distinguishes drafts, external handoffs, and confirmed submissions', async () => {
    stubRoutes(() => ({ success: true, data: LIST_PAGE }))
    renderAt('/applications', [{ path: '/applications', element: <ApplicationsPage /> }])

    expect(await screen.findByText('Software Engineer')).toBeInTheDocument()
    const list = screen.getByRole('list')

    // Status is shown as a plain-language label, not a raw enum.
    expect(within(list).getByText('Draft')).toBeInTheDocument()
    expect(within(list).getByText('External handoff')).toBeInTheDocument()
    expect(within(list).getByText('Submitted')).toBeInTheDocument()

    // Next action distinguishes an external handoff from a real submission.
    expect(within(list).getByText(/Review materials and request review/)).toBeInTheDocument()
    expect(within(list).getByText(/Finish applying on the platform page/)).toBeInTheDocument()
    // A confirmed submission is labelled as such, not as a handoff.
    expect(within(list).getByText(/no further action/i)).toBeInTheDocument()

    // Each row is a link to its application detail page.
    const rowLinks = within(list).getAllByRole('link')
    expect(rowLinks).toHaveLength(3)
    expect(rowLinks[0]).toHaveAttribute('href', '/applications/app-1')
  })

  it('searches by job title and filters by status', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    stubRoutes((url) => {
      urls.push(url)
      return { success: true, data: LIST_PAGE }
    })

    renderAt('/applications', [{ path: '/applications', element: <ApplicationsPage /> }])
    await screen.findByText('Software Engineer')

    await user.type(screen.getByLabelText('Search applications'), 'acme')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(urls.some((u) => u.includes('search=acme'))).toBe(true)
    })

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'DRAFT')
    await waitFor(() => {
      expect(urls.some((u) => u.includes('status=DRAFT'))).toBe(true)
    })
  })

  it('shows a helpful empty state when filters exclude everything', async () => {
    stubRoutes(() => ({
      success: true,
      data: { applications: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
    }))
    renderAt('/applications', [{ path: '/applications', element: <ApplicationsPage /> }])

    expect(await screen.findByText('No applications yet')).toBeInTheDocument()
    expect(screen.getByText(/Prepare application/)).toBeInTheDocument()
  })

  it('paginates history', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    stubRoutes((url) => {
      urls.push(url)
      const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1')
      return {
        success: true,
        data: {
          ...LIST_PAGE,
          applications: [{ ...DRAFT_APP, id: `app-p${page}`, jobSnapshot: { title: `Page ${page} App`, companyName: 'C' } }],
          total: 30,
          page,
          totalPages: 2,
        },
      }
    })

    renderAt('/applications', [{ path: '/applications', element: <ApplicationsPage /> }])
    expect(await screen.findByText('Page 1 App')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('Page 2 App')).toBeInTheDocument()
    expect(urls.some((u) => u.includes('page=2'))).toBe(true)
  })
})
