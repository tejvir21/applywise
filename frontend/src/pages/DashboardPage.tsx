import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHealth } from '@/hooks/useHealth'
import { getJobMatches, getJobsTotal, getSavedJobsTotal } from '@/services/jobs'
import { getApplications } from '@/services/applications'
import { getProfileCompletion } from '@/services/profile'

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { data: health, isLoading: healthLoading, isError: healthError } = useHealth()
  const jobs = useQuery({ queryKey: ['dashboard-jobs'], queryFn: getJobsTotal, retry: 1 })
  const saved = useQuery({ queryKey: ['dashboard-saved'], queryFn: getSavedJobsTotal, retry: 1 })
  const applications = useQuery({
    queryKey: ['dashboard-applications'],
    queryFn: () => getApplications({ pageSize: 100 }),
    retry: 1,
  })
  const strongMatches = useQuery({
    queryKey: ['dashboard-strong-matches'],
    queryFn: () => getJobMatches({ minScore: 80, pageSize: 1 }),
    retry: 1,
  })
  const completion = useQuery({
    queryKey: ['dashboard-completion'],
    queryFn: getProfileCompletion,
    retry: 1,
  })

  const loading = [jobs, saved, applications, strongMatches, completion].some((q) => q.isPending)
  const failed = [jobs, saved, applications, strongMatches, completion].some((q) => q.isError)

  const appCounts = new Map<string, number>()
  for (const item of applications.data?.applications ?? []) {
    appCounts.set(item.status, (appCounts.get(item.status) ?? 0) + 1)
  }
  const appTotal = applications.data?.total ?? 0
  const appCapped = appTotal > 100

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live counts from your jobs, matches, and applications. Interviews and offers are not tracked here."
      />
      {loading && <p className="mb-4 text-sm text-slate-600">Loading metrics…</p>}
      {failed && (
        <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 px-6 py-4 text-center">
          <h2 className="text-sm font-semibold text-red-900">Some metrics could not load</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-red-700">
            Sign in and complete your profile; missing pieces show below as unavailable.
          </p>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Jobs tracked"
          value={jobs.data?.toString() ?? 'Not available'}
          hint={jobs.data === 0 ? 'Import or add jobs to get started.' : undefined}
        />
        <MetricCard label="Saved jobs" value={saved.data?.toString() ?? 'Not available'} />
        <MetricCard
          label="Strong matches (≥80)"
          value={strongMatches.data ? strongMatches.data.total.toString() : 'Not available'}
          hint="Deterministic fit scores, not interview odds."
        />
        <MetricCard
          label="Applications"
          value={applications.data ? appTotal.toString() : 'Not available'}
          hint={appCapped ? 'Status breakdown covers the first 100.' : undefined}
        />
        <MetricCard
          label="Profile completion"
          value={completion.data ? `${completion.data.percentage}%` : 'Not available'}
          hint="Complete your profile to improve matching."
        />
        <MetricCard label="Interviews" value="Not available" hint="Interview tracking is not implemented." />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Applications by status</CardTitle>
        </CardHeader>
        <CardContent>
          {applications.data ? (
            appCounts.size > 0 ? (
              <ol className="flex flex-wrap gap-2">
                {[...appCounts.entries()].map(([status, count]) => (
                  <li
                    key={status}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {status}: {count}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-600">
                No applications yet.{' '}
                <Link className="text-brand-700 underline" to="/jobs">
                  Find jobs to apply to
                </Link>
                .
              </p>
            )
          ) : (
            <p className="text-sm text-slate-600">Not available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          {healthLoading && <p>Loading health…</p>}
          {healthError && <p>Could not reach the API. Start the backend on port 8000.</p>}
          {health && (
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                Status{' '}
                <Badge variant={health.status === 'ok' ? 'success' : 'warning'}>{health.status}</Badge>
              </div>
              <div>MongoDB: {health.mongodb}</div>
              <div>AI provider: {health.ai_provider}</div>
              <div>Storage: {health.storage_provider}</div>
              <div>Automation: {health.browser_automation_provider}</div>
              <div>Version: {health.version}</div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
