import { type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const toneStyles = {
  error: {
    wrap: 'border-[var(--danger)]/40 bg-[var(--danger-subtle)]',
    icon: 'text-[var(--danger)]',
    title: 'text-[var(--text-primary)]',
    body: 'text-[var(--text-secondary)]',
  },
  warning: {
    wrap: 'border-[var(--warning)]/40 bg-[var(--warning-subtle)]',
    icon: 'text-[var(--warning)]',
    title: 'text-[var(--text-primary)]',
    body: 'text-[var(--text-secondary)]',
  },
  info: {
    wrap: 'border-[var(--info)]/40 bg-[var(--info-subtle)]',
    icon: 'text-[var(--info)]',
    title: 'text-[var(--text-primary)]',
    body: 'text-[var(--text-secondary)]',
  },
  success: {
    wrap: 'border-[var(--success)]/40 bg-[var(--success-subtle)]',
    icon: 'text-[var(--success)]',
    title: 'text-[var(--text-primary)]',
    body: 'text-[var(--text-secondary)]',
  },
} as const

const toneIcons = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}

export function Banner({
  tone = 'error',
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof toneStyles
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  const styles = toneStyles[tone]
  const Icon = toneIcons[tone]
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xs', styles.wrap, className)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', styles.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <p className={cn('font-medium', styles.title)}>{title}</p>}
        {children && <div className={cn(title && 'mt-1', styles.body)}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title,
  description,
  onRetry,
  retrying,
  className,
}: {
  title: string
  description?: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger-subtle)] px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--danger)]/10 text-[var(--danger)]">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn('h-4 w-4', retrying && 'animate-spin')} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      )}
    </div>
  )
}