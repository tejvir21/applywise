import { scoreBand, type MatchScoreBand } from '@/lib/match'
import type { JobMatchExplanation } from '@/types/api'

const bandStyles: Record<MatchScoreBand, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  poor: 'bg-slate-200 text-slate-700',
}

export function MatchScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score)
  return (
    <span
      aria-label={`Match score ${score} out of 100 (${band} match)`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${bandStyles[band]}`}
    >
      {score} / 100 · {band}
    </span>
  )
}

export function MatchExplanation({ match }: { match: JobMatchExplanation }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
      {!match.eligible && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800">
          <p className="font-semibold">Eligibility warning</p>
          <ul className="mt-1 list-disc pl-5">
            {match.eligibilityReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="space-y-2">
        {match.factors.map((factor) => (
          <li key={factor.key} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{factor.label}</span>
              <span className="text-xs text-slate-500">
                {factor.evaluable ? `${factor.score} / 100` : 'unknown'}
              </span>
            </div>
            <p className="mt-0.5 text-slate-600">{factor.detail}</p>
            {factor.matched.length > 0 && (
              <p className="mt-1 text-emerald-700">Matched: {factor.matched.join(', ')}</p>
            )}
            {factor.mismatched.length > 0 && (
              <p className="mt-1 text-red-700">Missing: {factor.mismatched.join(', ')}</p>
            )}
          </li>
        ))}
      </ul>
      {match.missingData.length > 0 && (
        <div>
          <p className="font-medium text-slate-900">Missing or unknown data</p>
          <p className="text-slate-600">
            Score covers {match.evaluatedWeight}% of the weighting; unknown factors are excluded, never assumed.
          </p>
          <ul className="mt-1 list-disc pl-5 text-slate-600">
            {match.missingData.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Fit indicator for ranking only — not a probability of receiving an interview.
      </p>
    </div>
  )
}
