import { useState } from 'react'
import { usePlatforms } from '@/hooks/usePlatforms'
import {
  evaluateApplicationPolicy,
  requestApplicationHandoff,
  type PolicyEvaluation,
} from '@/services/platforms'

const decisionStyles: Record<PolicyEvaluation['decision'], string> = {
  auto_allowed: 'bg-emerald-100 text-emerald-800',
  approval_required: 'bg-amber-100 text-amber-800',
  manual_only: 'bg-sky-100 text-sky-800',
  blocked: 'bg-red-100 text-red-800',
}

const decisionLabels: Record<PolicyEvaluation['decision'], string> = {
  auto_allowed: 'Automatic submission allowed',
  approval_required: 'Approval required',
  manual_only: 'Manual handoff only',
  blocked: 'Blocked',
}

export function SubmissionReadiness({
  applicationId,
  status,
  onChanged,
}: {
  applicationId: string
  status: string
  onChanged: () => void
}) {
  const platformsQuery = usePlatforms()
  const [platform, setPlatform] = useState('linkedin')
  const [evaluation, setEvaluation] = useState<PolicyEvaluation | null>(null)
  const [handoff, setHandoff] = useState<{ applicationUrl: string; instructions: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function checkPolicy() {
    setError(null)
    setBusy(true)
    try {
      setEvaluation(await evaluateApplicationPolicy(applicationId, platform))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Policy check failed')
    } finally {
      setBusy(false)
    }
  }

  async function openHandoff() {
    setError(null)
    setBusy(true)
    try {
      const result = await requestApplicationHandoff(applicationId)
      window.open(result.applicationUrl, '_blank', 'noopener')
      setHandoff({ applicationUrl: result.applicationUrl, instructions: result.instructions })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handoff failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">Submission readiness</h2>
      <p className="mt-1 text-xs text-slate-500">
        No automatic submission exists for any platform yet. This check explains what is allowed;
        unsupported platforms fall back to a safe manual handoff.
      </p>
      {platformsQuery.isPending && <p className="mt-2 text-sm text-slate-600">Loading platforms…</p>}
      {platformsQuery.data && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-700">
            Platform
            <select
              aria-label="Platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {platformsQuery.data.map((p) => (
                <option key={p.platform} value={p.platform}>
                  {p.displayName} — apply: {p.capabilities.submit.status}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkPolicy()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Check policy
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {evaluation && (
        <div className="mt-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${decisionStyles[evaluation.decision]}`}
          >
            {decisionLabels[evaluation.decision]}
          </span>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
            {evaluation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {(status === 'APPROVED' || status === 'NEEDS_MANUAL_ACTION') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void openHandoff()}
          className="mt-2 rounded-md bg-sky-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Open application page
        </button>
      )}
      {status === 'NEEDS_MANUAL_ACTION' && (
        <p className="mt-2 text-sm text-slate-600">
          Complete the application on the platform page. Opening it never marks anything submitted.
        </p>
      )}
      {handoff && (
        <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-slate-900">Complete these steps on the platform page:</p>
          <ol className="mt-1 list-decimal pl-5 text-slate-700">
            {handoff.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
