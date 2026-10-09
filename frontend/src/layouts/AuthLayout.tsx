import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-sm font-semibold text-slate-900">
          AI Job Application Agent
        </p>
        <Outlet />
      </div>
    </div>
  )
}
