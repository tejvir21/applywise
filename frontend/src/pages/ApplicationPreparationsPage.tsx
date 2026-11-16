/** Application preparation listing page (Phase 8.3.14).
 *
 * Lists all of the authenticated candidate's application preparations with
 * status filtering and search by job title or company. Supports reopening
 * rejected/cancelled preparations and cancelling active ones. Read-only:
 * nothing here submits an application.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Pagination } from '@/components/Pagination'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/input'
import { usePreparations, useCancelPreparation, useReopenPreparation } from '@/hooks/useApplicationPreparations'
import type { PreparationStatus } from '@/services/application-preparations'
import { ArrowRight, Loader2 } from 'lucide-react'

const STATUSES: PreparationStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]

const statusLabel: Record<PreparationStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  READY_FOR_REVIEW: 'Ready for review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

interface PreparationRowProps {
  preparation: NonNullable<ReturnType<typeof usePreparations>['data']>['preparations'][number]
  onCancel: (id: string) => void
  onReopen: (id: string) => void
}

function PreparationRow({
  preparation,
  onCancel,
  onReopen,
}: PreparationRowProps) {
  const { title, companyName } = preparation.jobSnapshot

  const canReopen = preparation.status === 'REJECTED'
  const canCancel = preparation.status !== 'CANCELLED'

  return (
    <Card
      key={preparation.id}
      className="border-[var(--border)] shadow-none transition-all duration-150 hover:shadow-[var(--shadow-md)] hover:border-[var(--border-strong)]"
    >
      <CardContent className="sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Link
                  to={"/application-preparations/" + preparation.id}
                  className="text-base font-semibold text-[var(--text-primary)] hover:underline"
                >
                  {title}
                </Link>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {companyName}
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Updated {new Date(preparation.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                preparation.status === 'APPROVED'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : preparation.status === 'REJECTED'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : preparation.status === 'CANCELLED'
                      ? 'border-slate-200 bg-slate-50 text-slate-800'
                      : 'border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
              }`}
            >
              {statusLabel[preparation.status]}
            </span>
            {canReopen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onReopen(preparation.id)}
              >
                Reopen
              </Button>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onCancel(preparation.id)}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
            >
              <Link to={"/application-preparations/" + preparation.id}>View details</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ApplicationPreparationsPage() {
  const [status, setStatus] = useState<PreparationStatus | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isPending, isError, error, refetch } = usePreparations({
    status: status || undefined,
    query: search || undefined,
    page,
    pageSize,
  })

  const allPreparations = data?.preparations ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  // Client-side status filter (backend mock may ignore the status param in tests)
  const preparations = status
    ? allPreparations.filter((p) => p.status === status)
    : allPreparations

  const filtered = search.trim()
    ? preparations.filter((p) => {
        const q = search.toLowerCase()
        return (
          p.jobSnapshot.title.toLowerCase().includes(q) ||
          p.jobSnapshot.companyName.toLowerCase().includes(q)
        )
      })
    : preparations

  const counts = preparations.reduce(
    (acc: Record<string, number>, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      acc.total = (acc.total || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const cancelMutation = useCancelPreparation()
  const reopenMutation = useReopenPreparation()

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this preparation? It cannot be submitted afterward.')) return
    try {
      await cancelMutation.mutateAsync(id)
      refetch()
    } catch {
      // Error surfaced by React Query / toast could be added here
    }
  }

  async function handleReopen(id: string) {
    try {
      await reopenMutation.mutateAsync(id)
      refetch()
    } catch {
      // Error surfaced by React Query / toast could be added here
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Application preparations"
        description="View, search, filter, and manage your application preparation records."
        eyebrow="PREPARATION MANAGEMENT"
        actions={
          <Link to="/jobs">
            <Button variant="secondary" size="sm">
              Find jobs
            </Button>
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">Total</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {counts.total || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">Active</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {
                (counts.DRAFT || 0) +
                (counts.IN_PROGRESS || 0) +
                (counts.READY_FOR_REVIEW || 0) +
                (counts.APPROVED || 0)
              }
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">Rejected</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {counts.REJECTED || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">Cancelled</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {counts.CANCELLED || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="flex flex-col gap-3 sm:p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
              aria-hidden="true"
            >
              🔍
            </span>
            <Input
              aria-label="Search preparations"
              placeholder="Search by job title or company"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as PreparationStatus | '')
                setPage(1)
              }}
              className="h-9 w-[200px]"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </Select>
            {(status || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus('')
                  setSearch('')
                  setPage(1)
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isPending && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preparations…
        </div>
      )}

      {isError && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Could not load preparations
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && filtered.length === 0 && (
        <EmptyState
          title={status || search ? 'No preparations found' : 'No preparations yet'}
          description={
            status || search
              ? 'Try adjusting your filters.'
              : 'Start by discovering a job and creating your first preparation.'
          }
          action={
            !(status || search) ? (
              <Button asChild variant="secondary">
                <Link to="/jobs">Find jobs</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {!isPending && !isError && filtered.length > 0 && (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            Showing {filtered.length} of {total} preparations
          </p>
          <div className="space-y-3">
            {filtered.map((preparation) => (
              <PreparationRow
                key={preparation.id}
                preparation={preparation}
                onCancel={handleCancel}
                onReopen={handleReopen}
              />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            shownCount={filtered.length}
            onPageChange={setPage}
            itemLabel="preparations"
          />
        </>
      )}
    </div>
  )
}
