/**
 * Application status presentation helpers.
 *
 * Kept separate from the badge component so both can be imported freely
 * (and so the component module only exports components).
 */

type StatusTone = 'draft' | 'review' | 'approved' | 'handoff' | 'submitted' | 'failed' | 'neutral'

export const statusToneStyles: Record<StatusTone, string> = {
  draft: 'bg-surface-muted text-ink-600 ring-line',
  review: 'bg-amber-50 text-amber-800 ring-amber-100',
  approved: 'bg-brand-50 text-brand-700 ring-brand-100',
  handoff: 'bg-violet-50 text-violet-700 ring-violet-100',
  submitted: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const toneByStatus: Record<string, StatusTone> = {
  DRAFT: 'draft',
  READY_FOR_REVIEW: 'review',
  AWAITING_APPROVAL: 'review',
  APPROVED: 'approved',
  NEEDS_MANUAL_ACTION: 'handoff',
  SUBMITTING: 'handoff',
  SUBMITTED: 'submitted',
  FAILED: 'failed',
  CANCELLED: 'neutral',
}

const labelByStatus: Record<string, string> = {
  DRAFT: 'Draft',
  READY_FOR_REVIEW: 'Ready for review',
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  NEEDS_MANUAL_ACTION: 'External handoff',
  SUBMITTING: 'Submitting',
  SUBMITTED: 'Submitted',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

/** Plain-language label for each status; unknown values pass through. */
export function statusLabel(status: string): string {
  return labelByStatus[status] ?? status
}

export function statusTone(status: string): string {
  return statusToneStyles[toneByStatus[status] ?? 'neutral']
}

/** Statuses that represent a genuine, confirmed submission outcome. */
export const CONFIRMED_SUBMISSION_STATUSES = ['SUBMITTED'] as const

/**
 * True only for states where the system actually recorded a successful
 * submission. Drafts, approvals and external handoffs are NOT submissions.
 */
export function isConfirmedSubmission(status: string): boolean {
  return (CONFIRMED_SUBMISSION_STATUSES as readonly string[]).includes(status)
}