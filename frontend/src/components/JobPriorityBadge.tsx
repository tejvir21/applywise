/** Priority badge for a prioritized job listing.
 *
 * Displays the backend's priority classification as a concise, colored badge.
 * The classification is a prioritization hint, not an application eligibility
 * decision. Never recalculates or overrides the backend's result.
 */

import type { JobPriorityLabel } from '@/services/jobs'

const labelStyles: Record<JobPriorityLabel, string> = {
  HIGH_PRIORITY: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  GOOD_MATCH_NEEDS_IMPROVEMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  PROFILE_INCOMPLETE: 'bg-slate-100 text-slate-800 border-slate-200',
  LOW_MATCH: 'bg-rose-100 text-rose-800 border-rose-200',
}

const labelText: Record<JobPriorityLabel, string> = {
  HIGH_PRIORITY: 'High priority',
  GOOD_MATCH_NEEDS_IMPROVEMENT: 'Good match — needs improvement',
  PROFILE_INCOMPLETE: 'Profile incomplete',
  LOW_MATCH: 'Low match',
}

interface JobPriorityBadgeProps {
  priority: JobPriorityLabel
}

export function JobPriorityBadge({ priority }: JobPriorityBadgeProps) {
  return (
    <span
      aria-label={labelText[priority]}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${labelStyles[priority]}`}
    >
      {labelText[priority]}
    </span>
  )
}
