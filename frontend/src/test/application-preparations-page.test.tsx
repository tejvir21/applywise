/** ApplicationPreparationsPage tests (Phase 8.3.14).
 *
 * The service layer is mocked so no HTTP fetch is involved.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from '@/components/RequireAuth'
import { ApplicationPreparationsPage } from '@/pages/ApplicationPreparationsPage'
import {
  listPreparations,
  cancelPreparation,
  reopenPreparation,
  type ApplicationPreparation,
  type PreparationsPage,
} from '@/services/application-preparations'
import { useAuthStore } from '@/stores/auth-store'

const PREPARATION_DRAFT: ApplicationPreparation = {
  id: 'prep-1',
  userId: 'user-1',
  jobId: 'job-1',
  jobSnapshot: { title: 'Senior Software Engineer', companyName: 'TechCorp' },
  resumeId: 'resume-1',
  resumeVersion: 1,
  status: 'DRAFT',
  missingInformation: [],
  tailoredResume: undefined,
  coverLetter: undefined,
  answers: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const PREPARATION_REJECTED: ApplicationPreparation = {
  id: 'prep-2',
  userId: 'user-1',
  jobId: 'job-2',
  jobSnapshot: { title: 'Product Manager', companyName: 'Acme Inc' },
  resumeId: 'resume-2',
  resumeVersion: 1,
  status: 'REJECTED',
  missingInformation: [],
  tailoredResume: undefined,
  coverLetter: undefined,
  answers: [],
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const PREPARATIONS_PAGE: PreparationsPage = {
  preparations: [PREPARATION_DRAFT, PREPARATION_REJECTED],
  total: 2,
  page: 1,
  pageSize: 20,
  totalPages: 1,
}

const EMPTY_PAGE: PreparationsPage = {
  preparations: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
}

vi.mock('@/services/application-preparations', () => ({
  listPreparations: vi.fn(),
  cancelPreparation: vi.fn(),
  reopenPreparation: vi.fn(),
}))

function renderPreparationsPage(path = '/application-preparations') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/application-preparations"
            element={
              <RequireAuth>
                <ApplicationPreparationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/application-preparations/:id"
            element={
              <RequireAuth>
                <div data-testid="detail-page">Prepare application</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(listPreparations).mockResolvedValue(PREPARATIONS_PAGE)
  vi.mocked(cancelPreparation).mockResolvedValue({ ...PREPARATION_DRAFT, status: 'CANCELLED' })
  vi.mocked(reopenPreparation).mockResolvedValue({ ...PREPARATION_REJECTED, status: 'DRAFT' })
  useAuthStore.setState({ status: 'signed-in', email: 'test@example.com', accessToken: 'token' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useAuthStore.setState({ status: 'unknown', email: null, accessToken: null })
})

describe('ApplicationPreparationsPage', () => {
  it('redirects signed-out visitors away from preparation content', async () => {
    useAuthStore.setState({ status: 'signed-out', email: null, accessToken: null })
    renderPreparationsPage()
    expect(screen.queryByText('Senior Software Engineer')).not.toBeInTheDocument()
  })

  it('shows loading indicator then lists preparations', async () => {
    renderPreparationsPage()
    expect(screen.getByText('Loading preparations…')).toBeInTheDocument()
    await screen.findByText('Senior Software Engineer')
    await screen.findByText('Product Manager')
    expect(screen.getByText(/Showing 2 of 2 preparations/)).toBeInTheDocument()
    expect(vi.mocked(listPreparations)).toHaveBeenCalledWith({
      status: undefined,
      page: 1,
      pageSize: 20,
    })
  })

  it('shows status badges for each preparation', async () => {
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')
    await screen.findByText('Product Manager')
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1)
  })

  it('shows action buttons based on status', async () => {
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')
    await screen.findByText('Product Manager')

    // REJECTED prep: Reopen button (and Cancel, since REJECTED -> CANCELLED is allowed)
    const reopenBtns = screen.getAllByRole('button', { name: 'Reopen' })
    expect(reopenBtns).toHaveLength(1)

    // DRAFT and REJECTED preps: Cancel button (both are cancellable per state machine)
    const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' })
    expect(cancelBtns).toHaveLength(2)
  })

  it('filters preparations by status', async () => {
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')

    const select = screen.getByLabelText(/filter by status/i)
    await userEvent.selectOptions(select, 'REJECTED')
    await screen.findByText('Product Manager')
    expect(screen.queryByText('Senior Software Engineer')).not.toBeInTheDocument()
    expect(vi.mocked(listPreparations)).toHaveBeenLastCalledWith({
      status: 'REJECTED',
      page: 1,
      pageSize: 20,
    })
  })

  it('searches preparations by job title or company', async () => {
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')

    const input = screen.getByLabelText(/search preparations/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'Acme')
    await screen.findByText('Product Manager')
    expect(screen.queryByText('Senior Software Engineer')).not.toBeInTheDocument()
  })

  it('reopens a rejected preparation', async () => {
    renderPreparationsPage()
    await screen.findByText('Product Manager')

    const reopenBtn = screen.getByRole('button', { name: 'Reopen' })
    await userEvent.click(reopenBtn)
    expect(vi.mocked(reopenPreparation)).toHaveBeenCalledWith('prep-2')
    await screen.findByText('Product Manager')
  })

  it('cancels a draft preparation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')

    // Find the Cancel button within the Senior Software Engineer (DRAFT) card
    const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' })
    let targetBtn: HTMLElement | null = null
    for (const btn of cancelBtns) {
      const card = btn.closest('div.shadow-none')
      if (card && card.textContent!.includes('Senior Software Engineer')) {
        targetBtn = btn as HTMLElement
        break
      }
    }
    expect(targetBtn).not.toBeNull()
    await userEvent.click(targetBtn!)
    expect(vi.mocked(cancelPreparation)).toHaveBeenCalledWith('prep-1')
    await screen.findByText('Senior Software Engineer')
  })

  it('shows empty state when no preparations', async () => {
    vi.mocked(listPreparations).mockResolvedValue(EMPTY_PAGE)
    renderPreparationsPage()
    await screen.findByText('No preparations yet')
  })

  it('navigates to preparation detail page', async () => {
    renderPreparationsPage()
    await screen.findByText('Senior Software Engineer')
    const links = screen.getAllByRole('link', { name: 'View details' })
    // Click the first "View details" link (for the DRAFT preparation)
    await userEvent.click(links[0])
    expect(screen.getByTestId('detail-page')).toBeInTheDocument()
  })
})
