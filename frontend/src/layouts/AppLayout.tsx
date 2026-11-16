import {
  Briefcase,
  FileText,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { HealthBanner } from "@/components/HealthBanner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import { useTheme } from "@/hooks/useTheme";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: FileText },
  { to: "/resumes", label: "Resumes", icon: FileUp },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const email = useAuthStore((state) => state.email);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  async function onSignOut() {
    await logout();
    navigate("/login");
  }

  const toggleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--sidebar)]/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--sidebar)]/80 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            className="lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            className="hidden lg:inline-flex"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)]">
              <span className="text-sm font-semibold">AW</span>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-semibold leading-none text-[var(--text-primary)]">
                ApplyWise
              </span>
              <span className="mt-0.5 text-xs leading-none text-[var(--text-tertiary)]">
                Career workspace
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="text-[var(--text-secondary)]"
          >
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>
          {email && (
            <div className="hidden items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-1 md:flex">
              <div className="h-6 w-6 rounded-full bg-[var(--accent-subtle)] text-center text-xs font-medium leading-6 text-[var(--accent)]">
                {email.charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[160px] truncate text-xs text-[var(--text-secondary)]">
                {email}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onSignOut()}
            aria-label="Sign out"
            className="text-[var(--text-secondary)]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
          <HealthBanner />
        </div>
      </header>
      <div className="flex">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={cn(
            "hidden lg:block border-r border-[var(--border)] bg-[var(--sidebar)] transition-all duration-200",
            sidebarOpen ? "w-[280px]" : "w-[80px]",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 lg:hidden">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Navigation
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150",
                        isActive
                          ? "bg-[var(--sidebar-active)] text-[var(--accent)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-primary)]",
                        !sidebarOpen && "lg:justify-center lg:px-2",
                      )
                    }
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        !sidebarOpen && "lg:h-5 lg:w-5",
                      )}
                    />
                    <span
                      className={cn("truncate", !sidebarOpen && "lg:hidden")}
                    >
                      {item.label}
                    </span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="border-t border-[var(--border)] p-3">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-2 py-2",
                  !sidebarOpen && "lg:justify-center",
                )}
              >
                <div className="h-8 w-8 rounded-full bg-[var(--accent-subtle)] text-center text-sm font-medium leading-8 text-[var(--accent)]">
                  {email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div
                  className={cn("min-w-0 flex-1", !sidebarOpen && "lg:hidden")}
                >
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {email?.split("@")[0] || "User"}
                  </p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">
                    {email || ""}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className={cn("min-w-0 flex-1 transition-all duration-200")}>
          <div className="w-full px-4 py-6 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-14">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
