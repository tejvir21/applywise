import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const login = useAuthStore((s) => s.login)
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Welcome back</h2>
        <p className="text-sm text-slate-400">Sign in to continue to your dashboard.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-5 text-sm">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-200">
            Email
          </label>
          <input
            id="email"
            aria-label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white shadow-inner shadow-black/20 transition focus:border-fuchsia-400/70 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            Password
          </label>
          <input
            id="password"
            aria-label="Password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white shadow-inner shadow-black/20 transition focus:border-fuchsia-400/70 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
            placeholder="Enter your password"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={isAuthenticating}
          className="w-full rounded-xl bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-300 text-slate-950 shadow-[0_40px_80px_-60px_rgba(192,132,252,0.9)] transition hover:brightness-110 disabled:opacity-70"
        >
          {isAuthenticating ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-slate-400">
          Need an account?{' '}
          <Link className="font-medium text-fuchsia-200 transition hover:text-fuchsia-100" to="/register">
            Create one
          </Link>
        </p>
      </form>
    </div>
  )
}
