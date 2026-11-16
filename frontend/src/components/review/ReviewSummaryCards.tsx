import { CircleCheck, Clock, ThumbsUp, Ban, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SummaryCounts {
  verified: number
  needsReview: number
  approved: number
  rejected: number
  readyToImport: number
}

/** Compact summary cards driven entirely by live review state. */
export function ReviewSummaryCards({ counts }: { counts: SummaryCounts }) {
  const cards = [
    {
      label: 'Verified skills',
      value: counts.verified,
      hint: 'Evidence-backed entries',
      icon: CircleCheck,
      iconClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Needs review',
      value: counts.needsReview,
      hint: 'Waiting for your decision',
      icon: Clock,
      iconClass: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Approved',
      value: counts.approved,
      hint: 'Will import on request',
      icon: ThumbsUp,
      iconClass: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Rejected',
      value: counts.rejected,
      hint: 'Excluded from import',
      icon: Ban,
      iconClass: 'bg-red-50 text-red-700',
    },
    {
      label: 'Ready to import',
      value: counts.readyToImport,
      hint: 'Profile fields with values',
      icon: ListChecks,
      iconClass: 'bg-blue-50 text-blue-700',
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', card.iconClass)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <dt className="truncate text-xs font-medium text-slate-500">{card.label}</dt>
              <dd className="text-lg font-semibold leading-tight text-slate-900">{card.value}</dd>
              <dd className="truncate text-[11px] text-slate-400">{card.hint}</dd>
            </span>
          </div>
        )
      })}
    </dl>
  )
}
