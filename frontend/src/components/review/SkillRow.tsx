import { Ban, CircleCheck, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExpandableEvidence } from '@/components/review/ExpandableEvidence'
import { methodLabel } from '@/services/review-model'
import { cn } from '@/lib/utils'

export interface VerifiedSkillView {
  name: string
  category?: string
  context?: string
  originalText?: string
  section?: string
  method?: string
  evidence?: string
  rating?: string
  proficiency?: string
}

/** One verified skill: evidence, context, and reject/restore — never delete. */
export function SkillRow({
  skill,
  rejected,
  disabled,
  onReject,
  onRestore,
}: {
  skill: VerifiedSkillView
  rejected: boolean
  disabled?: boolean
  onReject: () => void
  onRestore: () => void
}) {
  return (
    <li
      className={cn(
        'rounded-xl border bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        rejected ? 'border-red-200' : 'border-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CircleCheck
          className={cn('h-4 w-4 shrink-0', rejected ? 'text-slate-300' : 'text-emerald-600')}
          aria-hidden="true"
        />
        <span className={cn('text-sm font-semibold text-slate-900', rejected && 'line-through')}>
          {skill.name}
        </span>
        <span className="text-xs font-medium text-emerald-700">Verified</span>
        {skill.category && <Badge variant="default">{skill.category}</Badge>}
        {skill.context && (
          <Badge variant="info" title={`Extracted in a “${skill.context}” context`}>
            {skill.context}
          </Badge>
        )}
        {skill.rating && (
          <Badge
            variant="info"
            title="Rating printed on the resume itself — evidence, not an assessed proficiency level."
          >
            stated: {skill.rating}
          </Badge>
        )}
        {skill.proficiency && (
          <Badge
            variant="info"
            title="Proficiency exactly as stated on the resume — never mapped to a profile level."
          >
            stated proficiency: {skill.proficiency}
          </Badge>
        )}
        <Badge variant="default" title="No proficiency is ever inferred by the parser.">
          proficiency: not specified
        </Badge>
      </div>

      {skill.originalText && skill.originalText !== skill.name && (
        <p className="mt-1 break-words text-xs text-slate-500">
          Original text: <span className="font-medium text-slate-700">“{skill.originalText}”</span>
        </p>
      )}
      {skill.evidence && (
        <div className="mt-1">
          <ExpandableEvidence
            text={skill.evidence}
            label={`Evidence · ${methodLabel(skill.method, skill.section)}`}
          />
        </div>
      )}

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
              aria-label={`Restore skill ${skill.name}`}
              title="Return to the verified list. Does not approve anything."
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Restore
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onReject}
            aria-label={`Reject skill ${skill.name}`}
            title="Exclude from import. You can restore it later."
          >
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            Reject
          </Button>
        )}
      </div>
    </li>
  )
}
