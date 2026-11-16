/**
 * Job discovery types.
 *
 * This module powers LIVE job discovery (search across real sources). It is
 * deliberately separate from the persist-oriented `JobSourceAdapter` used by
 * `POST /api/jobs/import/*`: discovery never writes to the database, never
 * touches the matching formula, and must surface honest per-source state.
 *
 * Core integrity rules encoded by these types:
 *  - A posting date, a source-provided update date, and the date ApplyWise
 *    fetched a listing are three DISTINCT values. We never substitute the
 *    retrieval date for the posting date.
 *  - We never treat an accessible listing as an "open" vacancy.
 *  - We never equate "Remote" with "available in India"; eligibility is kept
 *    explicit and unknown eligibility is labeled honestly.
 */

/** Distinct, enumerable state for a single source's contribution. */
export type SourceState =
  | 'connected_with_results' // reached upstream and got matching listings
  | 'connected_no_matches' // reached upstream but nothing relevant
  | 'not_configured' // required credentials/settings missing
  | 'rate_limited' // upstream throttled us (respect cooldown)
  | 'temporarily_unavailable' // upstream error/timeout/5xx
  | 'blocked_upstream'; // anti-bot / Cloudflare / CAPTCHA / 403 wall

export type Freshness = 'any' | 'last7' | 'last14' | 'last30';
export type DiscoverySort = 'relevance' | 'newest';

export type RemoteType = 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unknown';

/** How much we trust the posting date we surface. */
export type DateConfidence = 'reliable' | 'approximate' | 'unavailable';

/** Remote country-eligibility, kept explicit rather than inferred loosely. */
export type RemoteEligibility =
  | 'onsite' // a physical, country-specific location
  | 'remote_worldwide' // source explicitly says "Worldwide" / "Anywhere"
  | 'remote_listed' // remote, with a specific set of eligible countries
  | 'unknown'; // remote or unclear; eligibility not stated

/** A single discovered (not-yet-persisted) listing. */
export interface DiscoveredJob {
  /** Stable internal dedupe key: `${sourceProvider}:${externalId}`. */
  dedupeKey: string;
  /** Canonical listing URL used for cross-source dedup. */
  canonicalUrl: string;
  /** Stable upstream id (source-specific). */
  externalId: string;
  /** Direct employer application URL, preserved verbatim where available. */
  applicationUrl?: string;

  title: string;
  companyName: string;
  companyWebsite?: string;
  location?: string;
  city?: string;
  /** Human/ISO country string as reported by the source. */
  country?: string;
  /** ISO alpha-2 country code, only when reliably known. */
  countryIso?: string;
  remoteType: RemoteType;
  remoteEligibility: RemoteEligibility;
  /** Eligible country ISO codes for remote roles, when the source lists them. */
  remoteEligibleCountries?: string[];
  /** True when the listing supports India (location or explicit eligibility). */
  indiaEligible: boolean;
  employmentType?: string;

  description?: string;

  // Provenance / attribution
  sourceName: string; // e.g. greenhouse:groww, muse, adzuna
  sourceProvider: string; // greenhouse | lever | ashby | muse | adzuna | remotive
  sourceDisplayName: string; // e.g. "Groww (Greenhouse)"
  /** The original role query that discovered this listing. */
  discoveredViaQuery: string;

  // Dates — kept strictly separate (see module docstring)
  postedAt?: Date; // source-provided posting date (never synthesized)
  updatedAt?: Date; // source-provided update date, when present
  fetchedAt: Date; // when ApplyWise fetched it (always set)
  dateConfidence: DateConfidence;
  /** Convenience flags derived from postedAt (undefined when undated). */
  isNewWithin7?: boolean;
  olderListing?: boolean; // > 30 days old
}

/** Input to a discovery search (user-facing, validated by the route schema). */
export interface DiscoverySearchInput {
  roles: string[]; // one or more role queries; bounded + expanded by the service
  location?: string; // free text (city or "India")
  countryIso?: string; // default "IN"
  includeRemote?: boolean; // default true
  includeWorldwideRemote?: boolean; // default true
  freshness?: Freshness; // default "any"
  sort?: DiscoverySort; // default "relevance"
  page?: number; // for "load more"
  pageSize?: number; // default 20
  /** Bound upstream fetching; sane defaults are applied by config. */
  maxPagesPerSource?: number;
  maxResultsPerSource?: number;
}

/** Per-source outcome; never fabricates totals. */
export interface SourceQueryResult {
  sourceName: string;
  sourceProvider: string;
  sourceDisplayName: string;
  state: SourceState;
  jobs: DiscoveredJob[]; // normalized, before cross-source dedupe
  /** Raw listings received+normalized for this source (pre-dedupe). */
  fetchedCount: number;
  /** Upstream-reported total ONLY when the source reliably provides it. */
  upstreamTotal?: number;
  pagesFetched: number;
  error?: string;
  fetchedAt: Date;
  /** When upstream asked us to back off; the service will not re-poll before this. */
  cooldownUntil?: Date;
}

/** Aggregate response returned to the client. */
export interface DiscoveryResponse {
  jobs: DiscoveredJob[]; // deduped, filtered, sorted, paginated slice
  totalUnique: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** The bounded, expanded set of role queries actually issued. */
  queries: string[];
  within7Count: number;
  olderCount: number;
  undatedCount: number;
  sources: SourceQueryResult[];
  /** Honest accounting of what was dropped and why (diagnosis + UI hints). */
  excluded: { duplicates: number; relevance: number; geo: number; freshness: number };
  /** Freshness distribution across the whole unique set (post-filter context). */
  fetchedAt: Date;
  hasMore: boolean;
}

/** Contract every discovery source implements. */
export interface DiscoverySource {
  readonly sourceName: string;
  readonly sourceProvider: string;
  readonly displayName: string;
  /** Whether this source has the credentials it needs right now. */
  isConfigured(): boolean;
  /** Run a bounded discovery for the given input. Must never throw. */
  search(input: DiscoverySearchInput, queries: string[]): Promise<SourceQueryResult>;
}
