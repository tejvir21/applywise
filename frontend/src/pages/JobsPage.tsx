import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { MatchExplanation, MatchScoreBadge } from '@/components/MatchExplanation'
import { PageHeader } from '@/components/PageHeader'
import { useJobMatches } from '@/hooks/useJobMatches'
import { getJobMatchExplanation } from '@/services/jobs'
import type { JobMatchExplanation } from '@/types/api'

export function JobsPage() {
  const [minScoreInput, setMinScoreInput] = useState('0')
  const [minScore, setMinScore] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [explanations, setExplanations] = useState<Record<string, JobMatchExplanation>>({})
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [loadingExplanation, setLoadingExplanation] = useState(false)

  const { data, isPending, isError, error, refetch } = useJobMatches({ minScore, page: 1, pageSize: 20 })

  function applyFilter(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(minScoreInput)
    setMinScore(Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.floor(parsed))) : 0)
  }

  async function toggleExplanation(jobId: string) {
    if (expandedId === jobId) {
      setExpandedId(null)
      return
    }
    setExpandedId(jobId)
    setExplanationError(null)
    if (explanations[jobId]) return
    setLoadingExplanation(true)
    try {
      const match = await getJobMatchExplanation(jobId)
      setExplanations((prev) => ({ ...prev, [jobId]: match }))
    } catch (err) {
      setExplanationError(err instanceof Error ? err.message : 'Could not load the explanation')
    } finally {
      setLoadingExplanation(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Ranked by deterministic match score against your verified profile. Scores only — nothing is submitted from this page."
      />
      <form onSubmit={applyFilter} className="mb-4 flex items-end gap-2">
        <label className="text-sm text-slate-700">
          Minimum match score
          <input
            aria-label="Minimum match score"
            type="number"
            min={0}
            max={100}
            value={minScoreInput}
            onChange={(event) => setMinScoreInput(event.target.value)}
            className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      {isPending && <p className="text-sm text-slate-600">Loading matches…</p>}

      {isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load matches</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-red-700">
            {error instanceof Error ? error.message : 'Unknown error'} Sign in and complete your
            profile to see ranked matches.
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

      {!isPending && !isError && (!data || data.matches.length === 0) && (
        <EmptyState
          title="No matches yet"
          description={
            minScore > 0
              ? `No jobs score at least ${minScore}. Lower the minimum score or add more jobs.`
              : 'Import or add jobs, then return here to see them ranked by match score.'
          }
        />
      )}

      {!isPending && !isError && data && data.matches.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">
            Showing {data.matches.length} of {data.total} ranked matches (scored {data.scanned} jobs).
          </p>
          <ul className="space-y-3">
            {data.matches.map((job) => (
              <li key={job.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{job.title}</p>
                    <p className="text-sm text-slate-600">
                      {job.companyName}
                      {job.location ? ` · ${job.location}` : ''}
                      {job.source ? ` · ${job.source}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!job.eligible && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        eligibility warning
                      </span>
                    )}
                    <MatchScoreBadge score={job.matchScore} />
                    <button
                      type="button"
                      onClick={() => void toggleExplanation(job.id)}
                      aria-expanded={expandedId === job.id}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {expandedId === job.id ? 'Hide why' : 'Why this score?'}
                    </button>
                  </div>
                </div>
                {expandedId === job.id && (
                  <div>
                    {loadingExplanation && !explanations[job.id] && (
                      <p className="mt-3 text-sm text-slate-600">Loading explanation…</p>
                    )}
                    {explanationError && (
                      <p role="alert" className="mt-3 text-sm text-red-700">{explanationError}</p>
                    )}
                    {explanations[job.id] && <MatchExplanation match={explanations[job.id]} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
