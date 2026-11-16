import { Ban, ThumbsUp, TriangleAlert, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** One uncertain candidate: approve, reject, or restore — with its reason. */
export function CandidateRow({
  text,
  reason,
  section,
  approved,
  rejected,
  disabled,
  onApprove,
  onReject,
  onRestore,
}: {
  text: string
  reason: string
  section?: string
  approved: boolean
  rejected: boolean
  disabled?: boolean
  onApprove: () => void
  onReject: () => void
  onRestore: () => void
}) {
  return (
    <li
      className={cn(
        'rounded-xl border bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        rejected ? 'border-red-200' : approved ? 'border-emerald-200' : 'border-amber-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TriangleAlert
          className={cn('h-4 w-4 shrink-0', rejected ? 'text-slate-300' : 'text-amber-600')}
          aria-hidden="true"
        />
        <span className={cn('text-sm font-semibold text-slate-900', rejected && 'line-through')}>
          “{text}”
        </span>
        {approved && !rejected ? (
          <Badge variant="success">Approved for import</Badge>
        ) : (
          <Badge variant="warning">Needs review</Badge>
        )}
      </div>
      <p className="mt-1 break-words text-xs text-slate-500">
        {reason}
        {section ? ` · Section: ${section}` : ''}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {rejected ? (
          <>
            <span className="text-xs font-medium text-red-700">Rejected — excluded from import.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onRestore}
              aria-label={`Restore candidate ${text}`}
              title="Return to the review queue. Does not approve it."
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Restore
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={disabled}
              onClick={onApprove}
              aria-label={`${approved ? 'Unapprove' : 'Approve'} candidate ${text} for import`}
              title="Mark for import. Nothing changes on your profile until you import."
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              {approved ? 'Unapprove' : 'Approve'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={onReject}
              aria-label={`Reject candidate ${text}`}
              title="Exclude from import. You can restore it later."
            >
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </Button>
          </>
        )}
      </div>
      {approved && !rejected && (
        <p className="mt-1.5 text-xs font-medium text-emerald-700">
          Approved — imports only with your explicit approval, never automatically.
        </p>
      )}
    </li>
  )
}
