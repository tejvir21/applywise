import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationDetailPage } from '@/pages/ApplicationDetailPage'
import { ApplicationsPage } from '@/pages/ApplicationsPage'
import {
  cancelApplication,
  decideApplication,
  getApplication,
  getApplications,
  requestApplicationReview,
} from '@/services/applications'
import { useAuthStore } from '@/stores/auth-store'
import type { ApplicationListPage, JobApplication } from '@/types/api'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuthStore.setState({ accessToken: null, email: null, authError: null, isAuthenticating: false })
})

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      json: async () => payload,
    }),
  )
}

const DRAFT_APP: JobApplication = {
  id: 'app-1',
  jobId: 'job-1',
  jobSnapshot: { title: 'Software Engineer', companyName: 'TechCorp' },
  mode: 'permission',
  materials: {
    answers: [{ question: 'Work authorization?', answer: 'Yes', verified: false, sensitive: true }],
  },
  status: 'DRAFT',
  attemptCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const LIST_PAGE: ApplicationListPage = {
  applications: [
    DRAFT_APP,
    {
      ...DRAFT_APP,
      id: 'app-2',
      status: 'APPROVED',
      jobSnapshot: { title: 'Designer', companyName: 'DesignHub' },
      matchScore: 88,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

function renderWithProviders(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('auth store', () => {
  it('stores the session in memory on login and clears it on logout', async () => {
    stubFetch({ success: true, data: { access_token: 'token-123', token_type: 'bearer', expires_in: 900 } })
    await useAuthStore.getState().login('a@b.c', 'password123')

    expect(useAuthStore.getState().accessToken).toBe('token-123')
    expect(useAuthStore.getState().email).toBe('a@b.c')

    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().status).toBe('signed-out')
  })

  it('surfaces login failures without storing a token', async () => {
    stubFetch({ success: false, error: { code: 'UNAUTHORIZED', message: 'Bad credentials', details: {} } }, 401)
    await expect(useAuthStore.getState().login('a@b.c', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().authError).toBe('Bad credentials')
  })
})

describe('applications service', () => {
  it('sends the bearer token from the in-memory session', async () => {
    stubFetch({ success: true, data: { access_token: 'token-abc', token_type: 'bearer', expires_in: 900 } })
    await useAuthStore.getState().login('a@b.c', 'password123')

    stubFetch({ success: true, data: LIST_PAGE })
    await expect(getApplications({ status: 'DRAFT' })).resolves.toEqual(LIST_PAGE)
    expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/applications?status=DRAFT'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }) }),
    )
  })

  it('parses single-application, review, decision, cancel, and events payloads', async () => {
    stubFetch({ success: true, data: DRAFT_APP })
    await expect(getApplication('app-1')).resolves.toMatchObject({ id: 'app-1', status: 'DRAFT' })

    stubFetch({ success: true, data: { ...DRAFT_APP, status: 'AWAITING_APPROVAL' } })
    await expect(requestApplicationReview('app-1', true)).resolves.toMatchObject({ status: 'AWAITING_APPROVAL' })

    stubFetch({ success: true, data: { ...DRAFT_APP, status: 'APPROVED' } })
    await expect(decideApplication('app-1', 'approve')).resolves.toMatchObject({ status: 'APPROVED' })

    stubFetch({ success: true, data: { ...DRAFT_APP, status: 'CANCELLED' } })
    await expect(cancelApplication('app-1')).resolves.toMatchObject({ status: 'CANCELLED' })
  })
})

describe('ApplicationsPage', () => {
  it('lists applications with status and match info, and filters by status', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: LIST_PAGE })
    renderWithProviders('/applications')

    expect(await screen.findByText('Software Engineer')).toBeInTheDocument()
    const list = screen.getByRole('list')
    expect(within(list).getByText('DRAFT')).toBeInTheDocument()
    expect(within(list).getByText('APPROVED')).toBeInTheDocument()
    expect(screen.getByText(/score 88\/100/)).toBeInTheDocument()

    stubFetch({ success: true, data: { ...LIST_PAGE, applications: [LIST_PAGE.applications[0]], total: 1 } })
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'DRAFT')
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
        expect.stringContaining('status=DRAFT'),
        expect.anything(),
      )
    })
  })

  it('shows an empty state when there are no applications', async () => {
    stubFetch({ success: true, data: { ...LIST_PAGE, applications: [], total: 0 } })
    renderWithProviders('/applications')

    expect(await screen.findByText('No applications yet')).toBeInTheDocument()
  })

  it('shows an error state with retry when loading fails', async () => {
    stubFetch({ success: false, error: { code: 'UNAUTHORIZED', message: 'Nope', details: {} } }, 401)
    renderWithProviders('/applications')

    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toHaveTextContent('Could not load applications')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('ApplicationDetailPage', () => {
  it('shows draft answers with verification flags and requests review with confirmation', async () => {
    const user = userEvent.setup()
    stubFetch({ success: true, data: DRAFT_APP })
    renderWithProviders('/applications/app-1')

    expect(await screen.findByText('Work authorization?')).toBeInTheDocument()
    expect(screen.getByText(/unverified — needs confirmation/)).toBeInTheDocument()
    expect(screen.getByText(/sensitive declaration/)).toBeInTheDocument()

    stubFetch({ success: true, data: { ...DRAFT_APP, status: 'AWAITING_APPROVAL' } })
    await user.click(screen.getByLabelText(/I confirm these 1 unverified answer/))
    await user.click(screen.getByRole('button', { name: 'Request review' }))

    expect(await screen.findByText('Review request recorded.')).toBeInTheDocument()
    // The success path invalidates queries, so later GETs follow; assert the
    // review POST itself was issued with the confirmation flag.
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/applications/app-1/request-review'),
      expect.objectContaining({
        body: JSON.stringify({ confirmUnverified: true }),
      }),
    )
  })

  it('approves from review states and records no submission', async () => {
    const user = userEvent.setup()
    const reviewable = { ...DRAFT_APP, status: 'AWAITING_APPROVAL', materials: { answers: [] } }
    stubFetch({ success: true, data: reviewable })
    renderWithProviders('/applications/app-1')

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()

    stubFetch({ success: true, data: { ...reviewable, status: 'APPROVED' } })
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Approval recorded.')).toBeInTheDocument()
    expect(screen.getByText(/nothing is submitted from this page/)).toBeInTheDocument()
  })

  it('shows errors and manual-action requirements', async () => {
    stubFetch({
      success: true,
      data: { ...DRAFT_APP, status: 'FAILED', lastError: 'Engine unavailable', manualActionRequired: 'Upload the resume by hand' },
    })
    renderWithProviders('/applications/app-1')

    expect(await screen.findByText('Engine unavailable')).toBeInTheDocument()
    expect(screen.getByText('Upload the resume by hand')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel application' })).toBeInTheDocument()
  })
})
