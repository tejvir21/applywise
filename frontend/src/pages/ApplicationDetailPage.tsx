import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import { ApplicationStatusBadge } from '@/components/ApplicationStatusBadge'
import { MaterialsEditor } from '@/components/MaterialsEditor'
import { PageHeader } from '@/components/PageHeader'
import { useApplication, useApplicationEvents } from '@/hooks/useApplications'
import {
  cancelApplication,
  decideApplication,
  requestApplicationReview,
} from '@/services/applications'

const REVIEWABLE = ['READY_FOR_REVIEW', 'AWAITING_APPROVAL']
const CANCELLABLE = ['DRAFT', 'READY_FOR_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'FAILED', 'NEEDS_MANUAL_ACTION']

export function ApplicationDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const application = useApplication(id)
  const events = useApplicationEvents(id)
  const [confirmUnverified, setConfirmUnverified] = useState(false)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  async function runAction(label: string, fn: () => Promise<unknown>) {
    setActionError(null)
    setActionNotice(null)
    setActing(true)
    try {
      await fn()
      setActionNotice(`${label} recorded.`)
      await queryClient.invalidateQueries({ queryKey: ['application', id] })
      await queryClient.invalidateQueries({ queryKey: ['application-events', id] })
      await queryClient.invalidateQueries({ queryKey: ['applications'] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${label} failed`)
    } finally {
      setActing(false)
    }
  }

  if (application.isPending) return <p className="text-sm text-slate-600">Loading application…</p>

  if (application.isError) {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
        <h2 className="text-sm font-semibold text-red-900">Could not load application</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
          {application.error instanceof Error ? application.error.message : 'Unknown error'}
        </p>
        <button
          type="button"
          onClick={() => application.refetch()}
          className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Retry
        </button>
      </div>
    )
  }

  const app = application.data
  const unverified = app.materials.answers.filter((a) => !a.verified)

  return (
    <div>
      <PageHeader
        title={app.jobSnapshot.title}
        description={`${app.jobSnapshot.companyName} · mode ${app.mode}`}
      />

      {actionError && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      )}
      {actionNotice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {actionNotice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ApplicationStatusBadge status={app.status} />
        {app.matchScore !== undefined && (
          <span className="text-sm text-slate-600">Match {app.matchScore}/100</span>
        )}
        {app.matchEligible === false && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            eligibility warning
          </span>
        )}
      </div>

      {app.lastError && (
        <div role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">Last error</p>
          <p>{app.lastError}</p>
        </div>
      )}
      {app.manualActionRequired && (
        <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">Manual action required</p>
          <p>{app.manualActionRequired}</p>
        </div>
      )}

      <MaterialsEditor
        applicationId={id}
        editable={app.status === 'DRAFT'}
        reviewable={['DRAFT', 'READY_FOR_REVIEW', 'AWAITING_APPROVAL'].includes(app.status)}
        onChanged={() => {
          void application.refetch()
        }}
      />

      {unverified.length > 0 && (app.status === 'DRAFT' || REVIEWABLE.includes(app.status)) && (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmUnverified}
            onChange={(e) => setConfirmUnverified(e.target.checked)}
          />
          <span>
            I confirm these {unverified.length} unverified answer(s):{' '}
            {unverified.map((a) => a.question).join('; ')}
          </span>
        </label>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {app.status === 'DRAFT' && (
          <button
            type="button"
            disabled={acting}
            onClick={() => void runAction('Review request', () => requestApplicationReview(id, confirmUnverified))}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Request review
          </button>
        )}
        {REVIEWABLE.includes(app.status) && (
          <>
            <button
              type="button"
              disabled={acting}
              onClick={() => void runAction('Approval', () => decideApplication(id, 'approve', note || undefined, confirmUnverified))}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void runAction('Rejection', () => decideApplication(id, 'reject', note || undefined))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Reject
            </button>
            <input
              aria-label="Decision note"
              placeholder="Decision note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </>
        )}
        {CANCELLABLE.includes(app.status) && (
          <button
            type="button"
            disabled={acting}
            onClick={() => void runAction('Cancellation', () => cancelApplication(id))}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            Cancel application
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Approval records a decision only — nothing is submitted from this page.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Audit history</h2>
        {events.isPending && <p className="mt-1 text-sm text-slate-600">Loading history…</p>}
        {events.isError && <p className="mt-1 text-sm text-red-700">Could not load history.</p>}
        {events.data && events.data.length === 0 && (
          <EmptyState title="No events yet" description="Actions on this application will appear here." />
        )}
        {events.data && events.data.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {events.data.map((event) => (
              <li key={event.id}>
                <span className="font-medium">{event.type}</span>
                {event.fromStatus || event.toStatus ? (
                  <span className="text-slate-500">
                    {' '}
                    ({event.fromStatus ?? '—'} → {event.toStatus ?? '—'})
                  </span>
                ) : null}
                {event.message ? <span> — {event.message}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
