/** Verification status badge for generated preparation content (Phase 8.3.16).
 *
 * Displays the server-side factual verification result:
 *   VERIFIED — supported by available candidate facts.
 *   UNSUPPORTED — not supported by available candidate facts.
 *   NEEDS CANDIDATE INPUT — candidate clarification required.
 *
 * Heuristic verification is advisory, not a guarantee of absolute truth.
 */

import { type VerificationResult } from '@/services/application-preparations'

const statusStyles: Record<string, string> = {
  VERIFIED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UNSUPPORTED: 'bg-rose-100 text-rose-800 border-rose-200',
  NEEDS_CANDIDATE_INPUT: 'bg-amber-100 text-amber-800 border-amber-200',
}

const statusLabels: Record<string, string> = {
  VERIFIED: 'Verified',
  UNSUPPORTED: 'Unsupported',
  NEEDS_CANDIDATE_INPUT: 'Needs your input',
}

const freshnessStyles: Record<string, string> = {
  FRESH: '',
  STALE: 'bg-orange-100 text-orange-800 border-orange-200',
  MISSING_PROVENANCE: 'bg-slate-100 text-slate-800 border-slate-200',
}

const freshnessLabels: Record<string, string> = {
  FRESH: '',
  STALE: 'Stale — source data changed',
  MISSING_PROVENANCE: 'No provenance recorded',
}

interface VerificationBadgeProps {
  verification?: VerificationResult
  showDetails?: boolean
}

export function VerificationBadge({ verification, showDetails = false }: VerificationBadgeProps) {
  if (!verification) return null

  const { status, matchedFacts, unsupportedClaims, reason, freshness, staleReason } = verification

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-label={statusLabels[status] ?? status}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status] ?? 'bg-slate-100 text-slate-800 border-slate-200'}`}
        >
          {statusLabels[status] ?? status}
        </span>
        {freshness && freshness !== 'FRESH' && (
          <span
            aria-label={freshnessLabels[freshness] ?? freshness}
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${freshnessStyles[freshness] ?? ''}`}
          >
            {freshnessLabels[freshness] ?? freshness}
          </span>
        )}
      </div>
      {showDetails && (
        <div className="text-xs text-[var(--text-tertiary)] space-y-1 mt-1">
          {matchedFacts && matchedFacts.length > 0 && (
            <p>
              <span className="font-medium">Supported by:</span> {matchedFacts.join(', ')}
            </p>
          )}
          {unsupportedClaims && unsupportedClaims.length > 0 && (
            <p className="text-rose-700">
              <span className="font-medium">Not supported:</span> {unsupportedClaims.join('; ')}
            </p>
          )}
          {reason && <p>{reason}</p>}
          {staleReason && <p className="text-orange-700">{staleReason}</p>}
          <p className="italic">
            Verification is based on available candidate facts and automated checks. It is not a guarantee of absolute accuracy.
          </p>
        </div>
      )}
    </div>
  )
}
