import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  statusBadge?: { label: string; variant?: 'success' | 'warning' | 'info' | 'accent' | 'danger' }
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  eyebrow,
  statusBadge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        {(eyebrow || statusBadge) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {eyebrow && (
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-quaternary)]">
                {eyebrow}
              </span>
            )}
            {statusBadge && (
              <Badge variant={statusBadge.variant ?? 'accent'} size="sm">
                {statusBadge.label}
              </Badge>
            )}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
