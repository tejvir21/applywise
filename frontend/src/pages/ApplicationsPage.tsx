import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { ApplicationStatusBadge } from '@/components/ApplicationStatusBadge'
import { PageHeader } from '@/components/PageHeader'
import { useApplications } from '@/hooks/useApplications'

const STATUSES = [
  '',
  'DRAFT',
  'READY_FOR_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED',
  'NEEDS_MANUAL_ACTION',
  'CANCELLED',
]

export function ApplicationsPage() {
  const [status, setStatus] = useState('')
  const { data, isPending, isError, error, refetch } = useApplications({ status: status || undefined, page: 1, pageSize: 20 })

  return (
    <div>
      <PageHeader
        title="Applications"
        description="Drafts, reviews, approvals, and history. Approving records a decision only — nothing is submitted automatically."
      />
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-slate-700">
          Status
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>
                {s || 'All'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending && <p className="text-sm text-slate-600">Loading applications…</p>}

      {isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load applications</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
            {error instanceof Error ? error.message : 'Unknown error'} Sign in to see your applications.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && (!data || data.applications.length === 0) && (
        <EmptyState
          title="No applications yet"
          description={
            status
              ? `No applications with status ${status}. Clear the filter or create a draft from a job.`
              : 'Create a draft from a job to start the review and approval workflow.'
          }
        />
      )}

      {!isPending && !isError && data && data.applications.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">
            Showing {data.applications.length} of {data.total} applications.
          </p>
          <ul className="space-y-3">
            {data.applications.map((application) => (
              <li key={application.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link
                      to={`/applications/${application.id}`}
                      className="font-medium text-slate-900 underline"
                    >
                      {application.jobSnapshot.title}
                    </Link>
                    <p className="text-sm text-slate-600">
                      {application.jobSnapshot.companyName}
                      {application.matchScore !== undefined ? ` · score ${application.matchScore}/100` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ApplicationStatusBadge status={application.status} />
                    {application.matchEligible === false && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        eligibility warning
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
