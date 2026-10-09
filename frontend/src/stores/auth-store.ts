import { create } from 'zustand'
import { apiGet, apiPost, setAccessToken, setRefreshHandler, setSessionExpiredHandler } from '@/services/api'

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out'

type AuthState = {
  accessToken: string | null
  email: string | null
  authError: string | null
  isAuthenticating: boolean
  status: SessionStatus
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  /** Restore from the HttpOnly refresh cookie. Never throws. */
  restore: () => Promise<void>
  logout: () => Promise<void>
}

async function fetchSessionToken(): Promise<string | null> {
  // Never attempt a refresh once the session is known dead (signed out):
  // each request then fails fast with its own 401 instead of stampeding.
  if (useAuthStore.getState().status === 'signed-out') {
    return null
  }
  try {
    const data = await apiPost<{ access_token: string }>('/api/auth/refresh')
    setAccessToken(data.access_token)
    return data.access_token
  } catch {
    return null
  }
}

async function clearSession() {
  setAccessToken(null)
  try {
    // Best effort: also clear the server-side cookie. Failures here must not
    // break local sign-out (e.g. offline).
    await apiPost('/api/auth/logout')
  } catch {
    // Intentionally ignored.
  }
}

/**
 * In-memory session only. The short-lived access token lives in JS memory
 * (cleared on reload and logout) and is never written to localStorage,
 * sessionStorage, or logs. Persistence across reloads comes from the
 * HttpOnly refresh-token cookie (server-set, never readable from JS).
 * Tradeoff: clearing site cookies signs the user out.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  email: null,
  authError: null,
  isAuthenticating: false,
  status: 'unknown',

  login: async (email: string, password: string) => {
    set({ isAuthenticating: true, authError: null })
    try {
      const data = await apiPost<{ access_token: string }>('/api/auth/login', { email, password })
      setAccessToken(data.access_token)
      set({ accessToken: data.access_token, email, isAuthenticating: false, status: 'signed-in' })
    } catch (err) {
      set({ authError: err instanceof Error ? err.message : 'Sign-in failed', isAuthenticating: false })
      throw err
    }
  },

  register: async (email: string, password: string) => {
    set({ isAuthenticating: true, authError: null })
    try {
      const data = await apiPost<{ access_token: string }>('/api/auth/register', { email, password })
      setAccessToken(data.access_token)
      set({ accessToken: data.access_token, email, isAuthenticating: false, status: 'signed-in' })
    } catch (err) {
      set({ authError: err instanceof Error ? err.message : 'Registration failed', isAuthenticating: false })
      throw err
    }
  },

  restore: async () => {
    if (get().status !== 'unknown') return
    try {
      const session = await apiGet<{ access_token: string }>('/api/auth/session')
      setAccessToken(session.access_token)
      // Resolve identity through the authenticated endpoint, not the token.
      const me = await apiGet<{ email: string }>('/api/auth/me')
      set({ accessToken: session.access_token, email: me.email, status: 'signed-in' })
    } catch {
      setAccessToken(null)
      set({ accessToken: null, email: null, status: 'signed-out' })
    }
  },

  logout: async () => {
    await clearSession()
    set({ accessToken: null, email: null, authError: null, status: 'signed-out' })
  },
}))

// Single wiring point: expired-token retries refresh once (shared flight);
// a failed refresh signs the store out exactly once. Identity (email) is
// left untouched: it was resolved at login/restore time.
let refreshWired = false
if (!refreshWired) {
  refreshWired = true
  setRefreshHandler(async () => {
    const token = await fetchSessionToken()
    if (!token) {
      useAuthStore.setState({ accessToken: null, email: null, status: 'signed-out' })
      return null
    }
    useAuthStore.setState({ accessToken: token })
    return token
  })
  setSessionExpiredHandler(() => {
    useAuthStore.setState({ accessToken: null, email: null, status: 'signed-out' })
  })
}
