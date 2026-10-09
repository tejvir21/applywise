import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from '@/components/RequireAuth'
import { AppLayout } from '@/layouts/AppLayout'
import { apiGet } from '@/services/api'
import { useAuthStore } from '@/stores/auth-store'

function jsonResponse(status: number, payload: unknown) {
  return { status, json: async () => payload }
}

function resetAuth() {
  useAuthStore.setState({
    accessToken: null,
    email: null,
    authError: null,
    isAuthenticating: false,
    status: 'unknown',
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetAuth()
})

function renderAuthed(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/login"
            element={<p>Signed-out landing</p>}
          />
          <Route
            path="/app"
            element={
              <RequireAuth>
                <p>Protected content</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('authenticated requests', () => {
  it('retries a single 401 through one shared refresh flight', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.c' })
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Expired', details: {} } }))
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Expired', details: {} } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { access_token: 'fresh-token' } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: 1 } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ok: 2 } }))
    vi.stubGlobal('fetch', fetchMock)

    const [first, second] = await Promise.all([apiGet('/api/jobs'), apiGet('/api/jobs')])
    expect(first).toEqual({ ok: 1 })
    expect(second).toEqual({ ok: 2 })
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
    const retried = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/api/jobs') &&
        (init as RequestInit).headers instanceof Object &&
        ((init as unknown as { headers: Record<string, string> }).headers.Authorization === 'Bearer fresh-token'),
    )
    expect(retried).toHaveLength(2)
  })

  it('never retries auth endpoints (no login/refresh loops)', async () => {
    useAuthStore.setState({ status: 'unknown' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Bad credentials', details: {} } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet('/api/auth/login')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(apiGet('/api/auth/session')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('signs out once when refresh fails and stops retrying dead sessions', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.c' })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Expired', details: {} } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet('/api/jobs')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(useAuthStore.getState().status).toBe('signed-out')
    const callsAfterFirstRound = fetchMock.mock.calls.length

    // A dead session fails fast: no further refresh attempts.
    await expect(apiGet('/api/jobs')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstRound + 1)
  })
})

describe('session lifecycle', () => {
  it('restores a session from the cookie and resolves identity', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { access_token: 'restored', token_type: 'bearer', expires_in: 900 } }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { id: 'u1', email: 'a@b.c' } }))
    vi.stubGlobal('fetch', fetchMock)

    await useAuthStore.getState().restore()
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', email: 'a@b.c', accessToken: 'restored' })
  })

  it('lands signed-out when no cookie session exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'No session', details: {} } })),
    )
    await useAuthStore.getState().restore()
    expect(useAuthStore.getState().status).toBe('signed-out')
  })

  it('logout clears client state and invalidates the server cookie', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.c', accessToken: 't' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { message: 'ok' } }))
    vi.stubGlobal('fetch', fetchMock)

    await useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', accessToken: null, email: null })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.anything())
  })
})

describe('protected routes', () => {
  it('shows a loader while the session is unknown', () => {
    useAuthStore.setState({ status: 'unknown' })
    renderAuthed('/app')
    expect(screen.getByText('Checking session…')).toBeInTheDocument()
  })

  it('redirects signed-out users to login', async () => {
    useAuthStore.setState({ status: 'signed-out' })
    renderAuthed('/app')
    expect(await screen.findByText('Signed-out landing')).toBeInTheDocument()
  })

  it('renders protected content when signed in', () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.c' })
    renderAuthed('/app')
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('signs out from navigation', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: { message: 'ok' } })))
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.c', accessToken: 't' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route path="/login" element={<p>Signed-out landing</p>} />
            <Route path="/app" element={<AppLayout />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('a@b.c')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Signed-out landing')).toBeInTheDocument()
    expect(useAuthStore.getState().status).toBe('signed-out')
  })
})
