import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { JobDiscoveryPanel } from "@/components/JobDiscoveryPanel";
import {
  MatchExplanation,
  MatchScoreBadge,
} from "@/components/MatchExplanation";
import { JobPriorityBadge } from "@/components/JobPriorityBadge";
import { PageHeader } from "@/components/PageHeader";
import { useJobMatches } from "@/hooks/useJobMatches";
import { usePrioritizedJobs } from "@/hooks/useProfile";
import { getJobMatchExplanation } from "@/services/jobs";
import type { JobMatchExplanation } from "@/types/api";
import type { PrioritizedJob } from "@/services/jobs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, MapPin } from "lucide-react";

export function JobsPage() {
  const [minScoreInput, setMinScoreInput] = useState("0");
  const [minScore, setMinScore] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<
    Record<string, JobMatchExplanation>
  >({});
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const { data, isPending, isError, error, refetch } = useJobMatches({
    minScore,
    page: 1,
    pageSize: 20,
  });

  const { data: priorityData, isPending: priorityPending } = usePrioritizedJobs({
    minScore,
    page: 1,
    pageSize: 20,
  });

  const priorityById = new Map(
    (priorityData?.jobs ?? []).map((j: PrioritizedJob) => [j.id, j]),
  );

  function applyFilter(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(minScoreInput);
    setMinScore(
      Number.isFinite(parsed)
        ? Math.min(100, Math.max(0, Math.floor(parsed)))
        : 0,
    );
  }

  async function toggleExplanation(jobId: string) {
    if (expandedId === jobId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(jobId);
    setExplanationError(null);
    if (explanations[jobId]) return;
    setLoadingExplanation(true);
    try {
      const match = await getJobMatchExplanation(jobId);
      setExplanations((prev) => ({ ...prev, [jobId]: match }));
    } catch (err) {
      setExplanationError(
        err instanceof Error ? err.message : "Could not load the explanation",
      );
    } finally {
      setLoadingExplanation(false);
    }
  }

  function getReadinessSummary(match: any): string | null {
    const prio = priorityById.get(match.id);
    if (!prio) return null;
    const { matchedSkills, missingSkills, missingRequiredProfileFields } =
      prio.readiness;
    const bits: string[] = [];
    if (matchedSkills.length > 0)
      bits.push("Matched: " + matchedSkills.join(", "));
    if (missingSkills.length > 0)
      bits.push("Missing skills: " + missingSkills.join(", "));
    if (missingRequiredProfileFields.length > 0)
      bits.push(
        "Complete profile: " + missingRequiredProfileFields.join(", "),
      );
    return bits.length > 0 ? bits.join(" · ") : null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Jobs"
        description="Discover live vacancies and review ranked matches against your verified profile. You apply externally on each source site."
        eyebrow="JOB DISCOVERY"
      />

      <JobDiscoveryPanel />

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Matched jobs
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Personalized matches based on your profile
            </p>
          </div>
          <form
            onSubmit={applyFilter}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span>Min. match score</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={minScoreInput}
                onChange={(event) => setMinScoreInput(event.target.value)}
                aria-label="Minimum match score"
                placeholder="0-100"
                className="h-9 w-[90px]"
              />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
          </form>
        </div>
        <div className="px-6 py-5">
          {isPending || priorityPending ? (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Loading matches...
            </div>
          ) : null}
          {isError && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-primary)]"
            >
              {error instanceof Error
                ? error.message
                : "Could not load matches."}{" "}
              <button
                type="button"
                onClick={() => refetch()}
                className="underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}

          {!isPending &&
            !isError &&
            (!data?.matches || data.matches.length === 0) && (
              <EmptyState
                title="No matched jobs yet"
                description="Discover jobs above, then complete your profile to generate matches."
              />
            )}

          {data?.matches && data.matches.length > 0 && (
            <div className="space-y-3">
              {data.matches.map((match: any) => {
                const prio = priorityById.get(match.id);
                const readinessSummary = getReadinessSummary(match);
                return (
                  <Card
                    key={match.id}
                    className="border-[var(--border)] shadow-none transition-all duration-150 hover:shadow-[var(--shadow-md)] hover:border-[var(--border-strong)]"
                  >
                    <CardContent className="sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                                {match.title}
                              </h3>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                {match.companyName}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <MatchScoreBadge score={match.matchScore} />
                              {prio && <JobPriorityBadge priority={prio.priority} />}
                            </div>
                          </div>
                          {readinessSummary && (
                            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                              {readinessSummary}
                            </p>
                          )}
                          {(match.location ||
                            match.salaryMin ||
                            match.salaryMax) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
                              {match.location && <span>{match.location}</span>}
                              {(match.salaryMin || match.salaryMax) && (
                                <>
                                  {match.location && (
                                    <span>
                                      <MapPin className="h-4 w-4" />
                                    </span>
                                  )}
                                  <span>
                                    {match.salaryMin && match.salaryMax
                                      ? "$" +
                                        match.salaryMin.toLocaleString() +
                                        " - $" +
                                        match.salaryMax.toLocaleString()
                                      : match.salaryMin
                                        ? "From $" +
                                          match.salaryMin.toLocaleString()
                                        : "Up to $" +
                                          match.salaryMax!.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleExplanation(match.id)}
                          className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        >
                          {expandedId === match.id
                            ? "Hide explanation"
                            : "Why this match?"}
                        </button>
                        {(match.applicationUrl || match.jobUrl || match.url) && (
                          <a
                            href={
                              match.applicationUrl || match.jobUrl || match.url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                          >
                            View job <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      {expandedId === match.id && (
                        <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
                          {loadingExplanation && !explanations[match.id] ? (
                            <p className="text-sm text-[var(--text-tertiary)]">
                              Loading explanation...
                            </p>
                          ) : explanations[match.id] ? (
                            <MatchExplanation match={explanations[match.id]} />
                          ) : explanationError ? (
                            <p className="text-sm text-[var(--text-primary)]">
                              {explanationError}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
