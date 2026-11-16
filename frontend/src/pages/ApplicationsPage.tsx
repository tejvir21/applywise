import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { ApplicationStatusBadge } from "@/components/ApplicationStatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { useApplications } from "@/hooks/useApplications";
import { FileText, Search, Plus, Loader } from "lucide-react";

const STATUSES = [
  "",
  "DRAFT",
  "READY_FOR_REVIEW",
  "AWAITING_APPROVAL",
  "APPROVED",
  "SUBMITTING",
  "SUBMITTED",
  "FAILED",
  "NEEDS_MANUAL_ACTION",
  "CANCELLED",
];

export function ApplicationsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const { data, isPending, isError, error, refetch } = useApplications({
    status: status || undefined,
    page: 1,
    pageSize: 50,
  });

  const apps = (data as any)?.applications || [];
  const filtered = search.trim()
    ? apps.filter((a: any) => {
        const q = search.toLowerCase();
        return (
          a.jobSnapshot?.title?.toLowerCase().includes(q) ||
          a.jobSnapshot?.companyName?.toLowerCase().includes(q)
        );
      })
    : apps;

  const counts = apps.reduce(
    (acc: Record<string, number>, app: any) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      acc.total = (acc.total || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Applications"
        description="Track and manage your job application journey."
        eyebrow="APPLICATION TRACKER"
        actions={
          <Button asChild className="gap-2">
            <Link to="/jobs" className="flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" />
              Find jobs
            </Link>
          </Button>
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
            <p className="text-sm text-[var(--text-secondary)]">In progress</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {(counts.DRAFT || 0) +
                (counts.READY_FOR_REVIEW || 0) +
                (counts.AWAITING_APPROVAL || 0) +
                (counts.APPROVED || 0) +
                (counts.SUBMITTING || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">Submitted</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {counts.SUBMITTED || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="sm:p-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Needs attention
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
              {(counts.FAILED || 0) + (counts.NEEDS_MANUAL_ACTION || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
        <CardContent className="flex flex-col gap-3 sm:p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <Input
              aria-label="Search applications"
              placeholder="Search by job title or company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-[200px]"
            >
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s ? s.replace(/_/g, " ") : "All statuses"}
                </option>
              ))}
            </Select>
            {(status || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus("");
                  setSearch("");
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
          <Loader className="h-4 w-4 animate-spin" />
          Loading applications...
        </div>
      )}

      {isError && (
        <Card className="border-[var(--border)] shadow-[var(--shadow-sm)]">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Could not load applications
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && filtered.length === 0 && (
        <EmptyState
          title={
            status || search ? "No applications found" : "No applications yet"
          }
          description={
            status || search
              ? "Try adjusting your filters."
              : "Start by discovering jobs and creating your first application."
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
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Showing {filtered.length}{" "}
            {(data as any)?.total ? "of " + (data as any).total : ""}{" "}
            applications
          </p>
          {filtered.map((application: any) => (
            <Card
              key={application.id}
              className="border-[var(--border)] shadow-none transition-all duration-150 hover:shadow-[var(--shadow-md)] hover:border-[var(--border-strong)]"
            >
              <CardContent className="sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)]">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={"/applications/" + application.id}
                          className="text-base font-semibold text-[var(--text-primary)] hover:underline"
                        >
                          {application.jobSnapshot?.title}
                        </Link>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {application.jobSnapshot?.companyName}
                          {application.jobSnapshot?.location
                            ? " � " + application.jobSnapshot.location
                            : ""}
                          {application.matchScore !== undefined
                            ? " � Match " + application.matchScore + "/100"
                            : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ApplicationStatusBadge status={application.status} />
                    <Button asChild variant="ghost" size="sm">
                      <Link to={"/applications/" + application.id}>
                        View details
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
