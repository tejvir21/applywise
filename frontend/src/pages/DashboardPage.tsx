import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/hooks/useHealth";
import {
  getJobMatches,
  getJobsTotal,
  getSavedJobsTotal,
} from "@/services/jobs";
import { getApplications } from "@/services/applications";
import { getProfileCompletion } from "@/services/profile";
import {
  Briefcase,
  Bookmark,
  Target,
  FileText,
  UserCheck,
  Calendar,
  Plus,
  Upload,
  ArrowRight,
} from "lucide-react";

function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  featured = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  featured?: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        featured ? "ring-1 ring-[var(--accent)]/20" : ""
      }`}
    >
      {featured && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
      )}
      <CardContent className="flex items-start gap-3 sm:p-5">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] ${
            featured
              ? "bg-gradient-to-br from-[var(--accent)]/10 to-[var(--accent)]/5"
              : "bg-[var(--surface-secondary)]"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${featured ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { data: health } = useHealth();
  const jobs = useQuery({
    queryKey: ["dashboard-jobs"],
    queryFn: getJobsTotal,
    retry: 1,
  });
  const saved = useQuery({
    queryKey: ["dashboard-saved"],
    queryFn: getSavedJobsTotal,
    retry: 1,
  });
  const applications = useQuery({
    queryKey: ["dashboard-applications"],
    queryFn: () => getApplications({ pageSize: 100 }),
    retry: 1,
  });
  const strongMatches = useQuery({
    queryKey: ["dashboard-strong-matches"],
    queryFn: () => getJobMatches({ minScore: 80, pageSize: 1 }),
    retry: 1,
  });
  const completion = useQuery({
    queryKey: ["dashboard-completion"],
    queryFn: getProfileCompletion,
    retry: 1,
  });

  const appCounts = new Map<string, number>();
  for (const item of applications.data?.applications ?? []) {
    appCounts.set(item.status, (appCounts.get(item.status) ?? 0) + 1);
  }
  const appTotal = applications.data?.total ?? 0;
  const completionPct = completion.data?.percentage ?? null;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const statusOrder = [
    "applied",
    "interviewing",
    "offer",
    "rejected",
    "withdrawn",
  ];
  const orderedStatuses = [...appCounts.entries()].sort(([a], [b]) => {
    const ai = statusOrder.indexOf(a);
    const bi = statusOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const getStatusVariant = (status: string) => {
    if (status === "offer") return "success";
    if (status === "interviewing") return "accent";
    if (status === "rejected") return "warning";
    return "outline";
  };

  const getHealthStatus = (val?: string) => {
    if (!val) return { label: "Unknown", variant: "outline" as const };
    const v = val.toLowerCase();
    if (v === "ok" || v === "connected" || v === "healthy")
      return { label: val, variant: "accent" as const };
    if (v === "degraded") return { label: val, variant: "warning" as const };
    return { label: val, variant: "outline" as const };
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Overview
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            {getGreeting()}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">
            Track your job search, applications, and career progress in one
            place.
          </p>
          <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button asChild className="gap-2">
            <Link to="/jobs" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Discover jobs
            </Link>
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/resumes" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload resume
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Jobs tracked"
          value={
            jobs.data !== undefined
              ? jobs.data.toLocaleString()
              : "Not available"
          }
          icon={Briefcase}
          description="Total jobs in your pipeline"
          featured
        />
        <MetricCard
          label="Saved jobs"
          value={
            saved.data !== undefined
              ? saved.data.toLocaleString()
              : "Not available"
          }
          icon={Bookmark}
          description="Jobs bookmarked for later"
        />
        <MetricCard
          label="Strong matches (≥80)"
          value={
            strongMatches.data
              ? strongMatches.data.total.toLocaleString()
              : "Not available"
          }
          icon={Target}
          description="High-fit opportunities"
        />
        <MetricCard
          label="Applications"
          value={
            applications.data ? appTotal.toLocaleString() : "Not available"
          }
          icon={FileText}
          description="Active applications"
        />
        <MetricCard
          label="Profile completion"
          value={completionPct !== null ? `${completionPct}%` : "Not available"}
          icon={UserCheck}
          description="Keep improving your profile"
        />
        <MetricCard
          label="Interviews"
          value="Not available"
          icon={Calendar}
          description="Interview tracking coming soon"
        />
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="flex min-h-[280px] flex-col border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] lg:min-h-[300px] lg:col-span-8">
          <CardHeader className="flex flex-col gap-1 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Application pipeline</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Status breakdown based on your tracked applications.
              </p>
            </div>
            {appTotal > 0 && (
              <Badge variant="outline" className="w-fit">
                {appTotal} total
              </Badge>
            )}
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {applications.data ? (
              orderedStatuses.length > 0 ? (
                <div className="space-y-4">
                  {orderedStatuses.map(([status, count]) => {
                    const pct =
                      appTotal > 0 ? Math.round((count / appTotal) * 100) : 0;
                    return (
                      <div key={status} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={getStatusVariant(status)}
                              className="capitalize"
                            >
                              {status.replace("_", " ")}
                            </Badge>
                            <span className="text-sm text-[var(--text-secondary)]">
                              {count}{" "}
                              {count === 1 ? "application" : "applications"}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/80 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
                      <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
                    </div>
                    <h3 className="mt-3 text-base font-medium text-[var(--text-primary)]">
                      No applications yet
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">
                      Start tracking applications as you apply to jobs to see
                      your pipeline here.
                    </p>
                    <Button asChild className="mt-4 gap-2">
                      <Link to="/jobs" className="flex items-center gap-2">
                        Discover jobs
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Not available.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Profile readiness</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Strengthen your profile to improve match quality.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {completionPct !== null ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                      {completionPct}%
                    </p>
                    <UserCheck className="h-7 w-7 text-[var(--accent)]" />
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/80 transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Complete more profile sections to unlock stronger
                    recommendations.
                  </p>
                  <Button variant="outline" asChild className="w-full gap-2">
                    <Link
                      to="/profile"
                      className="flex items-center justify-center gap-2"
                    >
                      Complete profile
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-5 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Profile completion data not available.
                  </p>
                  <Button variant="outline" asChild className="mt-3 gap-2">
                    <Link
                      to="/profile"
                      className="flex items-center justify-center gap-2"
                    >
                      Go to profile
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">System health</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Live status of backend services and providers.
              </p>
            </CardHeader>
            <CardContent>
              {health ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      API status
                    </span>
                    <Badge variant={getHealthStatus(health.status).variant}>
                      {getHealthStatus(health.status).label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      MongoDB
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {health.mongodb}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      AI provider
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {health.ai_provider}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      Automation provider
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {health.browser_automation_provider}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      Storage provider
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {health.storage_provider}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                    <span className="text-sm text-[var(--text-secondary)]">
                      Application version
                    </span>
                    <span className="text-sm text-[var(--text-primary)]">
                      {health.version}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Could not reach the API.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
