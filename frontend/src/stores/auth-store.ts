import { create } from 'zustand'
import { apiPost, setAccessToken } from '@/services/api'

type AuthState = {
  accessToken: string | null
  email: string | null
  authError: string | null
  isAuthenticating: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

/**
 * In-memory session only. Tokens are kept in JS memory (cleared on reload
 * and logout), never written to localStorage/sessionStorage, and never
 * logged. Tradeoff: a page reload requires signing in again.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  email: null,
  authError: null,
  isAuthenticating: false,

  login: async (email: string, password: string) => {
    set({ isAuthenticating: true, authError: null })
    try {
      const data = await apiPost<{ access_token: string }>('/api/auth/login', { email, password })
      setAccessToken(data.access_token)
      set({ accessToken: data.access_token, email, isAuthenticating: false })
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
      set({ accessToken: data.access_token, email, isAuthenticating: false })
    } catch (err) {
      set({ authError: err instanceof Error ? err.message : 'Registration failed', isAuthenticating: false })
      throw err
    }
  },

  logout: () => {
    setAccessToken(null)
    set({ accessToken: null, email: null, authError: null })
  },
}))
