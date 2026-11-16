import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-lg bg-[var(--surface-tertiary)]',
        className,
      )}
    />
  )
}

export function SkeletonGroup({
  label = 'Loading',
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  )
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start gap-4">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
      </div>
    </div>
  )
}

export function JobCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading">
      <div className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonGroup>
  )
}

export function MetricSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    </div>
  )
}