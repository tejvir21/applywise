/**
 * JobDiscoveryService — live discovery orchestration.
 *
 * Responsibilities (mirrors the task phases):
 *  - Phase 4: expand the role query into a bounded set of related searches;
 *    dedupe combined results; keep the query that discovered each listing.
 *  - Phase 6: geographic + remote-eligibility filtering (India-aware).
 *  - Phase 3: freshness filtering with honest undated/older accounting.
 *  - Phase 2/7: per-source state, bounded pagination, cooldown (via client),
 *    and a short-TTL result cache so "load more" never re-hits upstream.
 *  - Ranking: relevance and freshness are kept SEPARATE; sort is one of
 *    'relevance' | 'newest'. It does NOT compute/alter the profile match score.
 */

import type {
  DiscoveredJob,
  DiscoveryResponse,
  DiscoverySearchInput,
  DiscoverySort,
  DiscoverySource,
  Freshness,
  SourceQueryResult,
} from './types.js';
import { expandQueries } from './queryExpansion.js';
import { bestRelevance } from './relevance.js';
import { dedupe } from './dedupe.js';
import { passesFreshness, classifyFreshness } from './freshness.js';
import { jobPassesGeo, passesCityFilter } from './geo.js';

export interface DiscoveryServiceConfig {
  maxQueries: number;
  relevanceThreshold: number;
  pageSize: number;
  maxOutputPerSource: number;
  resultCacheTtlMs: number;
}

const DEFAULT_CONFIG: DiscoveryServiceConfig = {
  maxQueries: 6,
  relevanceThreshold: 0.2,
  pageSize: 20,
  maxOutputPerSource: 30,
  resultCacheTtlMs: 120_000,
};

/** Sources that already searched upstream by keyword — free of client filtering. */
const KEYWORD_SOURCES = new Set(['adzuna', 'remotive']);

interface PreparedResult {
  queries: string[];
  jobs: DiscoveredJob[]; // unique, filtered, sorted
  sources: SourceQueryResult[];
  within7Count: number;
  olderCount: number;
  undatedCount: number;
  excluded: { duplicates: number; relevance: number; geo: number; freshness: number };
  fetchedAt: Date;
}

export class JobDiscoveryService {
  private readonly config: DiscoveryServiceConfig;
  private readonly cache = new Map<string, { at: number; value: PreparedResult }>();

  constructor(
    private readonly sources: DiscoverySource[],
    config: Partial<DiscoveryServiceConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Diagnostics used by tests + the /sources endpoint. */
  listSources(): Array<{ sourceName: string; sourceProvider: string; displayName: string; configured: boolean }> {
    return this.sources.map((s) => ({
      sourceName: s.sourceName,
      sourceProvider: s.sourceProvider,
      displayName: s.displayName,
      configured: s.isConfigured(),
    }));
  }

  async discover(input: DiscoverySearchInput): Promise<DiscoveryResponse> {
    const queries = expandQueries(input.roles.length ? input.roles : ['Software Engineer'], this.config.maxQueries);
    const cacheKey = this.cacheKey(input, queries);
    const cached = this.readCache(cacheKey);
    const prepared = cached ?? (await this.prepare(input, queries));
    if (!cached) this.writeCache(cacheKey, prepared);

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.max(1, input.pageSize ?? this.config.pageSize);
    const totalUnique = prepared.jobs.length;
    const totalPages = Math.max(1, Math.ceil(totalUnique / pageSize));
    const start = (page - 1) * pageSize;
    const slice = prepared.jobs.slice(start, start + pageSize);

    return {
      jobs: slice,
      totalUnique,
      page,
      pageSize,
      totalPages,
      queries: prepared.queries,
      within7Count: prepared.within7Count,
      olderCount: prepared.olderCount,
      undatedCount: prepared.undatedCount,
      excluded: prepared.excluded,
      sources: prepared.sources,
      fetchedAt: prepared.fetchedAt,
      hasMore: page < totalPages,
    };
  }

  private async prepare(input: DiscoverySearchInput, queries: string[]): Promise<PreparedResult> {
    const countryIso = input.countryIso ?? 'IN';
    const freshness: Freshness = input.freshness ?? 'any';
    const includeRemote = input.includeRemote ?? true;
    const includeWorldwide = input.includeWorldwideRemote ?? true;
    const city = input.location && !/^\s*india\s*$/i.test(input.location) ? input.location.trim() : undefined;

    // Fan out (bounded by the shared HTTP client's concurrency). A throwing
    // source never removes results from healthy sources.
    const sourceResults: SourceQueryResult[] = await Promise.all(
      this.sources.map((s) => this.guardedSearch(s, input, queries)),
    );

    // Filter combined results, tagging the query that discovered each job.
    const kept: Array<{ job: DiscoveredJob; score: number }> = [];
    let excludedRelevance = 0;
    let excludedGeo = 0;
    let excludedFreshness = 0;

    for (const result of sourceResults) {
      const keywordSearched = KEYWORD_SOURCES.has(result.sourceProvider);
      const perSourceKept: Array<{ job: DiscoveredJob; score: number }> = [];
      for (const job of result.jobs) {
        const { score, matchedQuery } = bestRelevance(
          { title: job.title, companyName: job.companyName, description: job.description },
          queries,
        );
        if (!keywordSearched && score < this.config.relevanceThreshold) {
          excludedRelevance += 1;
          continue;
        }
        if (!jobPassesGeo(job, { targetCountryIso: countryIso, includeRemote, includeWorldwideRemote: includeWorldwide })) {
          excludedGeo += 1;
          continue;
        }
        if (city && !passesCityFilter(job.location, city)) {
          excludedGeo += 1;
          continue;
        }
        if (!passesFreshness(job.postedAt, freshness)) {
          excludedFreshness += 1;
          continue;
        }
        const attributed = keywordSearched && job.discoveredViaQuery ? job.discoveredViaQuery : matchedQuery;
        perSourceKept.push({ job: { ...job, discoveredViaQuery: attributed }, score });
      }
      // Bound per-source output so one chatty source can't dominate.
      kept.push(...perSourceKept.slice(0, this.config.maxOutputPerSource));
    }

    const deduped = dedupe(kept.map((k) => k.job));
    const unique = deduped.jobs;

    // Derive freshness distribution directly from posting dates so counts are
    // correct regardless of what flags a source set.
    const within7Count = unique.filter((j) => classifyFreshness(j.postedAt).isNewWithin7).length;
    const olderCount = unique.filter((j) => classifyFreshness(j.postedAt).olderListing).length;
    const undatedCount = unique.filter((j) => !j.postedAt).length;

    // Reconcile per-source state: a "connected_with_results" source that
    // contributed nothing after dedupe/filtering becomes "connected_no_matches".
    const finalSources: SourceQueryResult[] = sourceResults.map((r) => {
      const contributed = unique.filter((j) => j.sourceName === r.sourceName).length;
      if (r.state === 'connected_with_results' && contributed === 0) {
        return { ...r, state: 'connected_no_matches', jobs: [] };
      }
      return { ...r, jobs: unique.filter((j) => j.sourceName === r.sourceName) };
    });

    const sort: DiscoverySort = input.sort ?? 'relevance';
    const scoreById = new Map<string, number>();
    for (const { job, score } of kept) scoreById.set(job.dedupeKey, score);
    const sorted = [...unique].sort((a, b) => {
      if (sort === 'newest') {
        const at = a.postedAt?.getTime() ?? -Infinity;
        const bt = b.postedAt?.getTime() ?? -Infinity;
        if (at !== bt) return bt - at; // newest first, undated last
        return a.title.localeCompare(b.title);
      }
      const sa = scoreById.get(a.dedupeKey) ?? 0;
      const sb = scoreById.get(b.dedupeKey) ?? 0;
      if (sb !== sa) return sb - sa;
      const at = a.postedAt?.getTime() ?? 0;
      const bt = b.postedAt?.getTime() ?? 0;
      return bt - at; // fresher breaks relevance ties
    });

    return {
      queries,
      jobs: sorted,
      sources: finalSources,
      within7Count,
      olderCount,
      undatedCount,
      excluded: {
        duplicates: deduped.removedCount,
        relevance: excludedRelevance,
        geo: excludedGeo,
        freshness: excludedFreshness,
      },
      fetchedAt: sourceResults[0]?.fetchedAt ?? new Date(),
    };
  }

  private async guardedSearch(
    source: DiscoverySource,
    input: DiscoverySearchInput,
    queries: string[],
  ): Promise<SourceQueryResult> {
    try {
      if (!source.isConfigured()) {
        return {
          sourceName: source.sourceName,
          sourceProvider: source.sourceProvider,
          sourceDisplayName: source.displayName,
          state: 'not_configured',
          jobs: [],
          fetchedCount: 0,
          pagesFetched: 0,
          fetchedAt: new Date(),
        };
      }
      return await source.search(input, queries);
    } catch (err) {
      return {
        sourceName: source.sourceName,
        sourceProvider: source.sourceProvider,
        sourceDisplayName: source.displayName,
        state: 'temporarily_unavailable',
        jobs: [],
        fetchedCount: 0,
        pagesFetched: 0,
        error: err instanceof Error ? err.message : String(err),
        fetchedAt: new Date(),
      };
    }
  }

  private cacheKey(input: DiscoverySearchInput, queries: string[]): string {
    return JSON.stringify([
      queries,
      input.location ?? '',
      input.countryIso ?? 'IN',
      input.includeRemote ?? true,
      input.includeWorldwideRemote ?? true,
      input.freshness ?? 'any',
      input.sort ?? 'relevance',
      input.maxPagesPerSource ?? 0,
      input.maxResultsPerSource ?? 0,
    ]);
  }

  private readCache(key: string): PreparedResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > this.config.resultCacheTtlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private writeCache(key: string, value: PreparedResult): void {
    this.cache.set(key, { at: Date.now(), value });
  }

  clearCache(): void {
    this.cache.clear();
  }
}
