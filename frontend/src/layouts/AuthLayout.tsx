import { Outlet } from 'react-router-dom'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

export function AuthLayout() {
  const status = useAuthStore((s) => s.status)
  if (status === 'signed-in') {
    return <Navigate to="/dashboard" replace />
  }
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
