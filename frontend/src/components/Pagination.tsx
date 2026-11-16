import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  shownCount,
  onPageChange,
  itemLabel = 'results',
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  shownCount: number
  onPageChange: (page: number) => void
  itemLabel?: string
}) {
  const safeTotalPages = Math.max(totalPages, 1)
  if (safeTotalPages <= 1) return null

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = (page - 1) * pageSize + shownCount

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-[var(--border)] pt-4 sm:flex-row"
    >
      <p className="text-sm text-[var(--text-tertiary)]" aria-live="polite">
        Showing {first}–{last} of {total} {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Button>
        <span className="px-1 text-sm text-[var(--text-tertiary)]">
          Page {page} of {safeTotalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= safeTotalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}