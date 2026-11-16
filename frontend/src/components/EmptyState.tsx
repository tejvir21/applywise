import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--text-quaternary)]">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
