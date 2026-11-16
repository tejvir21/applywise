import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-shadow duration-150',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 sm:p-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-base font-semibold tracking-tight text-[var(--text-primary)]', className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-[var(--text-secondary)]', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2 p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
}

export function CardSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-t border-[var(--border-subtle)] px-5 py-4 sm:px-6', className)}
      {...props}
    />
  )
}

export function CardInteractive({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition-all duration-150 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardMetric({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-all duration-150 hover:shadow-[var(--shadow-md)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardListItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-3 last:border-0 hover:bg-[var(--surface-secondary)] transition-colors duration-150',
        className,
      )}
      {...props}
    />
  )
}
