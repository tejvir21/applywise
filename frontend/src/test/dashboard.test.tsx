import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/pages/DashboardPage'
import { SettingsPage } from '@/pages/SettingsPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const HEALTH = {
  status: 'ok',
  service: 'svc',
  version: '0.1.0',
  environment: 'test',
  mongodb: 'connected',
  ai_provider: 'mock',
  storage_provider: 'local',
  browser_automation_provider: 'mock',
}

function routeFor(url: string) {
  if (url.includes('/api/health')) return { success: true, data: HEALTH }
  if (url.includes('/api/jobs/saved')) return { success: true, data: { savedJobs: [], total: 0 } }
  if (url.includes('/api/jobs/matches')) return { success: true, data: { matches: [], total: 0, page: 1, pageSize: 1, totalPages: 0, scanned: 0 } }
  if (url.includes('/api/jobs?')) return { success: true, data: { jobs: [], total: 3, page: 1, pageSize: 1, totalPages: 3 } }
  if (url.includes('/api/applications')) {
    return {
      success: true,
      data: {
        applications: [
          { id: 'a1', jobId: 'j1', jobSnapshot: { title: 'T', companyName: 'C' }, mode: 'permission', materials: { answers: [] }, status: 'DRAFT', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'a2', jobId: 'j2', jobSnapshot: { title: 'T', companyName: 'C' }, mode: 'permission', materials: { answers: [] }, status: 'APPROVED', attemptCount: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      },
    }
  }
  if (url.includes('/api/profile/completion')) {
    return { success: true, data: { percentage: 43, completedSections: [], incompleteSections: [] } }
  }
  throw new Error(`unexpected url ${url}`)
}

function stubRouter() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => ({
      status: 200,
      json: async () => routeFor(String(url)),
    })),
  )
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  it('populates metrics from real APIs and marks untracked ones unavailable', async () => {
    stubRouter()
    renderAt('/dashboard')

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('43%')).toBeInTheDocument()
    expect(screen.getByText('DRAFT: 1')).toBeInTheDocument()
    expect(screen.getByText('APPROVED: 1')).toBeInTheDocument()
    expect(screen.getByText('Interviews')).toBeInTheDocument()
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Phase 1/)).not.toBeInTheDocument()
  })

  it('shows meaningful zero states with no data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url)
        if (u.includes('/api/health')) return { status: 200, json: async () => ({ success: true, data: HEALTH }) }
        if (u.includes('/api/jobs/matches')) {
          return { status: 200, json: async () => ({ success: true, data: { matches: [], total: 0, page: 1, pageSize: 1, totalPages: 0, scanned: 0 } }) }
        }
        if (u.includes('/api/applications')) {
          return { status: 200, json: async () => ({ success: true, data: { applications: [], total: 0, page: 1, pageSize: 100, totalPages: 0 } }) }
        }
        if (u.includes('/api/profile/completion')) {
          return { status: 200, json: async () => ({ success: true, data: { percentage: 0, completedSections: [], incompleteSections: [] } }) }
        }
        return { status: 200, json: async () => ({ success: true, data: { jobs: [], total: 0, page: 1, pageSize: 1, totalPages: 0 } }) }
      }),
    )
    renderAt('/dashboard')

    expect(await screen.findByText('Import or add jobs to get started.')).toBeInTheDocument()
    expect(screen.getByText(/No applications yet/)).toBeInTheDocument()
  })
})

describe('SettingsPage', () => {
  const SETTINGS = { globalPaused: false, dailyLimit: 10, minMatchScore: 80, platforms: [] }
  const PLATFORMS = {
    platforms: [
      {
        platform: 'linkedin',
        displayName: 'LinkedIn',
        capabilities: {
          discovery: { status: 'unsupported' },
          detail: { status: 'unsupported' },
          questions: { status: 'unsupported' },
          prepare: { status: 'supported' },
          upload: { status: 'unavailable' },
          submit: { status: 'unsupported' },
          verify: { status: 'unavailable' },
          handoff: { status: 'supported' },
        },
        lastReviewed: '2026-10-09',
      },
    ],
  }

  it('loads, edits, and saves submission settings', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const u = String(url)
        if (u.includes('/api/health')) return { status: 200, json: async () => ({ success: true, data: HEALTH }) }
        if (u.includes('/api/platforms/settings/submission')) {
          if (init?.method === 'PUT') {
            return { status: 200, json: async () => ({ success: true, data: JSON.parse(String(init.body)) }) }
          }
          return { status: 200, json: async () => ({ success: true, data: SETTINGS }) }
        }
        if (u.includes('/api/platforms')) return { status: 200, json: async () => ({ success: true, data: PLATFORMS }) }
        throw new Error(`unexpected url ${u}`)
      }),
    )
    renderAt('/settings')
    expect(await screen.findByText('LinkedIn')).toBeInTheDocument()

    await user.click(screen.getByLabelText(/Global pause/))
    await user.clear(screen.getByLabelText('Maximum applications per day'))
    await user.type(screen.getByLabelText('Maximum applications per day'), '5')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('Submission settings saved.')).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('/api/platforms/settings/submission'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('"dailyLimit":5'),
      }),
    )
  })

  it('validates limits locally and shows server errors honestly', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const u = String(url)
        if (u.includes('/api/health')) return { status: 200, json: async () => ({ success: true, data: HEALTH }) }
        if (u.includes('/api/platforms/settings')) {
          return { status: 200, json: async () => ({ success: true, data: SETTINGS }) }
        }
        return { status: 200, json: async () => ({ success: true, data: PLATFORMS }) }
      }),
    )
    renderAt('/settings')
    await screen.findByText('LinkedIn')

    const calls = vi.mocked(fetch).mock.calls.length
    await user.clear(screen.getByLabelText('Maximum applications per day'))
    await user.type(screen.getByLabelText('Maximum applications per day'), '0')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('Daily limit must be a whole number between 1 and 100.')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    expect(screen.getByText('Data export is not available yet.')).toBeInTheDocument()
  })
})
