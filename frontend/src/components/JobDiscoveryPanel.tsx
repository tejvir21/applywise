import { useState } from "react";
import { useJobDiscovery } from "@/hooks/useJobDiscovery";
import { searchDiscoveredJobs } from "@/services/discovery";
import { ApiClientError } from "@/types/api";
import type {
  DiscoveredJob,
  DiscoveryFilters,
  SourceState,
  DiscoverySourceResult,
} from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Select, Checkbox } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Search,
  MapPin,
  Filter,
  ChevronDown,
} from "lucide-react";

const FRESHNESS_OPTIONS: Array<{
  value: DiscoveryFilters["freshness"];
  label: string;
}> = [
  { value: "any", label: "Any date" },
  { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" },
  { value: "last30", label: "Last 30 days" },
];

const SORT_OPTIONS: Array<{ value: DiscoveryFilters["sort"]; label: string }> =
  [
    { value: "relevance", label: "Relevance" },
    { value: "newest", label: "Newest first" },
  ];

const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  connected_with_results: "Connected • Results",
  connected_no_matches: "Connected • No matches",
  not_configured: "Not configured",
  rate_limited: "Rate limited",
  temporarily_unavailable: "Unavailable",
  blocked_upstream: "Upstream error",
};

const SOURCE_STATE_VARIANT: Record<
  SourceState,
  "success" | "warning" | "danger" | "subtle"
> = {
  connected_with_results: "success",
  connected_no_matches: "subtle",
  not_configured: "subtle",
  rate_limited: "warning",
  temporarily_unavailable: "warning",
  blocked_upstream: "danger",
};

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const DEFAULT_FILTERS: DiscoveryFilters = {
  roles: "React Developer",
  location: "India",
  freshness: "any",
  sort: "relevance",
  includeRemote: true,
  includeWorldwideRemote: true,
  countryIso: "IN",
  page: 1,
  pageSize: 20,
};

function JobCard({ job }: { job: DiscoveredJob }) {
  const isNew = job.isNewWithin7;
  const isOlder = job.olderListing;

  return (
    <li>
      <Card className="border-[var(--border)] shadow-none transition-all duration-150 hover:shadow-[var(--shadow-md)] hover:border-[var(--border-strong)]">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start gap-2">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {job.title}
                </h3>
                {isNew && (
                  <Badge variant="success" size="sm">
                    New
                  </Badge>
                )}
                {isOlder && (
                  <Badge variant="warning" size="sm">
                    Older
                  </Badge>
                )}
                {job.indiaEligible && (
                  <Badge variant="subtle" size="sm">
                    India-eligible
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {job.companyName}
                </span>
                {job.location && (
                  <>
                    <span className="text-[var(--text-quaternary)]">•</span>
                    <span>{job.location}</span>
                  </>
                )}
                <span className="text-[var(--text-quaternary)]">•</span>
                <span className="text-[var(--text-tertiary)]">
                  {job.sourceDisplayName}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                {job.postedAt ? (
                  <span>Posted {formatDate(job.postedAt)}</span>
                ) : (
                  <span>Posting date unavailable</span>
                )}
                {job.updatedAt && (
                  <span>• Updated {formatDate(job.updatedAt)}</span>
                )}
              </div>
            </div>
            {job.applicationUrl && (
              <a
                href={job.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
              >
                Apply at source <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function SkeletonCard() {
  return (
    <li>
      <Card className="border-[var(--border)] shadow-none">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--surface-tertiary)]" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--surface-tertiary)]" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-[var(--surface-tertiary)]" />
            </div>
            <div className="h-8 w-28 animate-pulse rounded-lg bg-[var(--surface-tertiary)]" />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function ProviderDiagnostics({
  sources,
}: {
  sources: DiscoverySourceResult[];
}) {
  const [expanded, setExpanded] = useState(false);

  const connectedWithResults = sources.filter(
    (s) => s.state === "connected_with_results",
  ).length;
  const connectedNoMatches = sources.filter(
    (s) => s.state === "connected_no_matches",
  ).length;
  const unavailable = sources.filter(
    (s) =>
      s.state !== "connected_with_results" &&
      s.state !== "connected_no_matches",
  ).length;

  const summaryParts: string[] = [];
  if (connectedWithResults)
    summaryParts.push(
      connectedWithResults +
        " source" +
        (connectedWithResults > 1 ? "s" : "") +
        " returned results",
    );
  if (connectedNoMatches)
    summaryParts.push(
      connectedNoMatches +
        " source" +
        (connectedNoMatches > 1 ? "s" : "") +
        " with no matches",
    );
  if (unavailable) summaryParts.push(unavailable + " unavailable");

  return (
    <Card className="mt-4 border-[var(--border)] shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              Sources & availability
            </h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1 text-[var(--text-secondary)]"
          >
            {expanded ? "Hide details" : "Show details"}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {summaryParts.join(" • ") || "No sources configured"}
        </p>
        {expanded && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source: DiscoverySourceResult) => (
              <div
                key={source.sourceName}
                className="rounded-lg border border-[var(--border)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {source.sourceDisplayName}
                  </span>
                  <Badge
                    variant={
                      SOURCE_STATE_VARIANT[source.state as SourceState] ??
                      "subtle"
                    }
                    size="sm"
                  >
                    {SOURCE_STATE_LABEL[source.state as SourceState]}
                  </Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span>Listings</span>
                    <span>{source.fetchedCount}</span>
                  </div>
                  {source.upstreamTotal && (
                    <div className="flex justify-between">
                      <span>Upstream</span>
                      <span>{source.upstreamTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Pages</span>
                    <span>{source.pagesFetched}</span>
                  </div>
                  {source.error && (
                    <p className="mt-1 rounded bg-[var(--surface-secondary)] px-2 py-1 text-[var(--text-tertiary)]">
                      {source.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function JobDiscoveryPanel() {
  const [draft, setDraft] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [submitted, setSubmitted] = useState<DiscoveryFilters | null>(null);
  const [extraJobs, setExtraJobs] = useState<DiscoveredJob[]>([]);
  const [extraPages, setExtraPages] = useState(0);
  const [moreAvailable, setMoreAvailable] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const { data, isError, error, isFetching } = useJobDiscovery(
    submitted ?? DEFAULT_FILTERS,
    submitted !== null,
  );

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setExtraJobs([]);
    setExtraPages(0);
    setMoreAvailable(true);
    setLoadMoreError(null);
    setSubmitted({ ...draft, page: 1 });
  }

  async function loadMore() {
    if (!data || !submitted) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = data.page + extraPages + 1;
      const page = await searchDiscoveredJobs({
        ...submitted,
        page: nextPage,
        pageSize: data.pageSize,
      });
      setExtraJobs((prev) => [...prev, ...page.jobs]);
      setExtraPages((n) => n + 1);
      setMoreAvailable(page.hasMore);
    } catch (err) {
      setLoadMoreError(
        err instanceof Error ? err.message : "Could not load more",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const allJobs: DiscoveredJob[] = data ? [...data.jobs, ...extraJobs] : [];
  const fewerThanRequested = data
    ? data.totalUnique < data.pageSize && !data.hasMore
    : false;

  return (
    <section aria-labelledby="discovery-heading" className="space-y-6">
      <Card className="border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-6">
            <h2
              id="discovery-heading"
              className="text-xl font-semibold tracking-tight text-[var(--text-primary)]"
            >
              Job search
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Search official public job sources in real time. Applications are
              completed on the original job site.
            </p>
          </div>

          <form onSubmit={applySearch} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-sm font-medium text-[var(--text-primary)]"
                  htmlFor="roles"
                >
                  Role or keyword
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    id="roles"
                    value={draft.roles ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, roles: e.target.value })
                    }
                    placeholder="e.g., React Developer, Frontend Engineer"
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-sm font-medium text-[var(--text-primary)]"
                  htmlFor="location"
                >
                  Location
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    id="location"
                    type="search"
                    value={draft.location ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                    placeholder="e.g., India, Remote"
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Freshness
                </span>
                <Select
                  aria-label="Freshness"
                  value={draft.freshness ?? "any"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      freshness: e.target
                        .value as DiscoveryFilters["freshness"],
                    })
                  }
                  className="h-9 w-[160px]"
                >
                  {FRESHNESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  Sort by
                </span>
                <Select
                  aria-label="Sort by"
                  value={draft.sort ?? "relevance"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sort: e.target.value as DiscoveryFilters["sort"],
                    })
                  }
                  className="h-9 w-[160px]"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Checkbox
                id="remote-checked"
                label="Remote"
                className="pt-5"
                checked={draft.includeRemote ?? true}
                onChange={(e) =>
                  setDraft({ ...draft, includeRemote: e.target.checked })
                }
              />
              <Checkbox
                id="worldwide-remote-checked"
                label="Worldwide remote"
                className="pt-5"
                checked={draft.includeWorldwideRemote ?? true}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    includeWorldwideRemote: e.target.checked,
                  })
                }
              />
              <div className="pt-5">
                <Button type="submit" disabled={isFetching} className="gap-2">
                  <Search className="h-4 w-4" />
                  {isFetching ? "Searching…" : "Search jobs"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {!submitted && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-5 text-center text-sm text-[var(--text-secondary)]">
          Set your filters and select{" "}
          <span className="font-medium text-[var(--text-primary)]">
            Search jobs
          </span>{" "}
          to find live listings from official public sources.
        </div>
      )}

      {submitted && isFetching && (
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Searching live sources…</span>
        </div>
      )}

      {submitted && isError && !isFetching && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-primary)]"
        >
          {error instanceof ApiClientError && error.status === 401
            ? "Your session expired. Sign in again to search."
            : error instanceof Error
              ? error.message
              : "Could not run discovery."}
        </div>
      )}

      {submitted && data && !isFetching && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Search results
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {data.totalUnique} unique listing
                {data.totalUnique !== 1 ? "s" : ""} • {data.within7Count} new
                (=7d) • Sorted by{" "}
                {submitted.sort === "newest" ? "newest" : "relevance"} • Last
                fetched {formatDateTime(data.fetchedAt)}
              </p>
            </div>
          </div>

          <ProviderDiagnostics sources={data.sources} />

          {data.totalUnique === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
              <p className="font-medium text-[var(--text-primary)]">
                No live listings matched
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Try broadening your role, location, or relaxing filters.
              </p>
            </div>
          ) : (
            <>
              {fewerThanRequested && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Fewer listings available than a full page • that's everything
                  the sources returned.
                </p>
              )}
              <ul className="space-y-3">
                {allJobs.map((job) => (
                  <JobCard key={job.dedupeKey} job={job} />
                ))}
                {isFetching &&
                  Array.from({ length: 2 }).map((_, i) => (
                    <SkeletonCard key={"sk-" + i} />
                  ))}
              </ul>
              {data.hasMore && moreAvailable && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                  {loadMoreError && (
                    <p className="text-sm text-[var(--text-primary)]">
                      {loadMoreError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
