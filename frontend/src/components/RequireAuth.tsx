import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'

/** Renders children only for signed-in users; otherwise redirects to login
 *  (remembering the attempted location). Unknown status shows a loader. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'unknown') {
    return <p className="p-6 text-sm text-slate-600">Checking session…</p>
  }
  if (status !== 'signed-in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
