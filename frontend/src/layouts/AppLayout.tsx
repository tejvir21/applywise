import {
  Briefcase,
  FileText,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { HealthBanner } from '@/components/HealthBanner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { useUiStore } from '@/stores/ui-store'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/applications', label: 'Applications', icon: FileText },
  { to: '/resumes', label: 'Resumes', icon: FileUp },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppLayout() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const email = useAuthStore((state) => state.email)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  async function onSignOut() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-slate-900">AI Job Application Agent</span>
        </div>
        <div className="flex items-center gap-3">
          {email && <span className="hidden text-sm text-slate-600 sm:inline">{email}</span>}
          <Button variant="ghost" size="sm" onClick={() => void onSignOut()} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">Sign out</span>
          </Button>
          <HealthBanner />
        </div>
      </header>
      <div className="flex">
        <aside
          className={cn(
            'min-h-[calc(100vh-3.5rem)] border-r border-slate-200 bg-white py-4 transition-all',
            sidebarOpen ? 'w-56 px-3' : 'w-0 overflow-hidden px-0',
          )}
        >
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100',
                      isActive && 'bg-brand-50 font-medium text-brand-700',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
