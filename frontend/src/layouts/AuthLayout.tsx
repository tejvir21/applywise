import { Outlet } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

export function AuthLayout() {
  const status = useAuthStore((s) => s.status)
  if (status === 'signed-in') {
    return <Navigate to="/dashboard" replace />
  }
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(1200px_800px_at_80%_-10%,rgba(168,85,247,0.35),transparent),radial-gradient(900px_700px_at_10%_110%,rgba(59,130,246,0.25),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.98)_100%)]" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400 via-violet-400 to-cyan-300 shadow-[0_40px_80px_-60px_rgba(192,132,252,0.9)]">
            <span className="text-lg font-black text-slate-950">AW</span>
          </div>
          <p className="text-sm uppercase tracking-[0.8em] text-fuchsia-200/70">ApplyWise</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Land your next opportunity
          </h1>
          <p className="mt-3 max-w-xl text-base text-slate-300">
            Track applications, tailor resumes, and stay on top of every interview with a focused workspace built for job seekers.
          </p>
        </div>
        <div className="w-full max-w-md">
          <div className="relative">
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-fuchsia-400/40 via-transparent to-cyan-300/30" />
            <div className="relative rounded-[calc(1.5rem-1px)] bg-slate-900/80 p-8 shadow-[0_80px_160px_-120px_rgba(168,85,247,0.9)] ring-1 ring-white/10 backdrop-blur-xl sm:p-10">
              <Outlet />
            </div>
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-slate-500">
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
