/**
 * First-party employer job boards.
 *
 * These are the companies' OWN public application endpoints, not a job-search
 * engine. They exist because aggregator coverage of Indian product companies is
 * thin, and because an employer's own board is the most authoritative source
 * available: it carries the employer's name, the real application URL, and
 * often an explicit "eligible countries" field.
 *
 * Only official, documented, unauthenticated job-posting endpoints are used:
 *   - Greenhouse : GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
 *   - Lever      : GET https://api.lever.co/v0/postings/{company}?mode=json
 *   - Ashby      : GET https://api.ashbyhq.com/posting-api/job-board/{board}
 *
 * No scraping, no credential use, no bypassing of access controls: each is a
 * public JSON feed the employer publishes for candidates.
 */

import { readFileSync } from 'node:fs';
import { getConfig } from '../config/index.js';
import { logger } from '../config/logger.js';
import {
  BaseJobSourceAdapter,
  type JobSearchCriteria,
  type JobSearchResult,
  type NormalizedJob,
} from './JobSourceAdapter.js';
import { ProviderError, fetchJsonWithTimeout, stripHtml, toNumber } from './providerUtils.js';
import { sanitizeSourceDate } from './jobFreshness.js';

export type CompanyBoardProvider = 'greenhouse' | 'lever' | 'ashby';

export interface CompanyBoard {
  /** Stable key used in configuration. */
  key: string;
  companyName: string;
  provider: CompanyBoardProvider;
  /** Public board token the employer's board is published under. */
  boardId: string;
  /** The employer's own careers page, for attribution and verification. */
  careersUrl?: string;
  enabled: boolean;
}

/**
 * Parse the configured board registry text.
 *
 * Format (one board per line, `#` starts a comment, `|` separates fields):
 *   key|Company|provider|boardToken|careersUrl
 * Example:
 *   razorpay|Razorpay|greenhouse|razorpay|https://razorpay.com/jobs/
 *
 * Fields may also be separated by `;` so the whole registry fits on one
 * environment-variable line (dotenv does not read multi-line values).
 *
 * Malformed lines are skipped rather than failing the whole registry, so one
 * typo cannot take every company board offline.
 */
export function parseBoardRegistry(raw: string | undefined): CompanyBoard[] {
  if (!raw) return [];
  const boards: CompanyBoard[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/[\r\n;]+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('|').map((p) => p.trim());
    if (parts.length < 4) continue;

    const [key, companyName, provider, boardId, careersUrl] = parts as [
      string, string, string, string, string | undefined,
    ];
    if (!key || !companyName || !boardId) continue;
    if (provider !== 'greenhouse' && provider !== 'lever' && provider !== 'ashby') continue;
    if (seen.has(key)) continue;
    seen.add(key);

    boards.push({
      key,
      companyName,
      provider,
      boardId,
      careersUrl: careersUrl || undefined,
      enabled: true,
    });
  }
  return boards;
}

/** Read the optional registry file, if one is configured and readable. */
function readBoardRegistryFile(): string | undefined {
  const path = getConfig().COMPANY_BOARD_REGISTRY_FILE;
  if (!path) return undefined;
  try {
    // Restrict to a local file the operator controls; this is server config,
    // never user input.
    return readFileSync(path, 'utf8');
  } catch {
    logger.warn({ path }, 'Company board registry file could not be read');
    return undefined;
  }
}

/**
 * Every configured board.
 *
 * The file is preferred when set because a maintained list of employer boards
 * is far easier to review and extend as one board per line; the inline
 * environment variable remains supported for single-board setups.
 */
export function getAllCompanyBoards(): CompanyBoard[] {
  const fromFile = readBoardRegistryFile();
  if (fromFile) return parseBoardRegistry(fromFile);
  return parseBoardRegistry(getConfig().COMPANY_BOARD_REGISTRY);
}

/** Normalize a free-text query/location into comparable lowercase tokens. */
function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/**
 * Geographic tokens that identify India on an employer board.
 *
 * A candidate searching "India" expects Indian roles, but employer boards label
 * them by city ("Bengaluru", "Noida") and rarely by country. Without this
 * mapping an India-wide search silently drops the very listings it targets.
 * "Remote" is included because these are India-eligible remote roles; it is
 * NOT treated as proof of eligibility for any other country.
 */
const INDIA_LOCATION_ALIASES = new Set([
  'india', 'indian', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai',
  'delhi', 'noida', 'gurgaon', 'gurugram', 'chennai', 'kolkata', 'ahmedabad',
  'jaipur', 'indore', 'kochi', 'coimbatore', 'chandigarh', 'bhopal', 'nagpur',
  'lucknow', 'mysore', 'mysuru', 'visakhapatnam', 'vadodara', 'surat', 'kanpur',
  'trivandrum', 'thiruvananthapuram', 'goa', 'telangana', 'karnataka', 'maharashtra',
  'tamil nadu', 'kerala', 'gujarat', 'rajasthan', 'mp', 'up',
]);

/** Whether a free-text location token refers to India. */
function isIndiaToken(token: string): boolean {
  return INDIA_LOCATION_ALIASES.has(token);
}

/** Whether a listing's location/country indicates it is open in India. */
function isIndiaEligible(listing: NormalizedJob): boolean {
  if (listing.country && listing.country.toUpperCase() === 'IN') return true;
  if ((listing.eligibleCountries ?? []).some((c) => c.toUpperCase() === 'IN')) return true;
  const haystack = `${listing.location ?? ''}`.toLowerCase();
  return tokens(haystack).some(isIndiaToken);
}

/** Generic words that must not on their own make a listing "relevant". */
const GENERIC_TITLE_TOKENS = new Set([
  'developer', 'engineer', 'software', 'manager', 'lead', 'senior', 'intern',
  'specialist', 'analyst', 'designer', 'remote', 'full', 'time', 'stack',
]);

/**
 * Score a board posting against a free-text query.
 *
 * Title matches dominate description matches on purpose: an employer board
 * lists every role at the company, so a description-only keyword hit ("software"
 * or "engineer" somewhere in the boilerplate) must not make an unrelated title
 * look like a match. A listing therefore has to match in its TITLE to qualify;
 * description text only adds ranking credit on top of that.
 * Returns 0 when nothing lines up.
 */
function boardRelevance(listing: NormalizedJob, criteria: JobSearchCriteria): number {
  const queryTokens = tokens(criteria.query);
  if (queryTokens.length === 0) return 1;

  const title = listing.title.toLowerCase();
  const desc = (listing.description ?? '').toLowerCase();
  const phrase = (criteria.query ?? '').trim().toLowerCase();

  const phraseInTitle = Boolean(phrase) && title.includes(phrase);
  const titleHits = queryTokens.filter((t) => title.includes(t));

  // No title overlap at all: this posting is not about the searched role.
  // Generic words such as "engineer" appearing only in a description are not
  // evidence of relevance.
  if (!phraseInTitle && titleHits.length === 0) return 0;

  let score = 0;
  if (phraseInTitle) score += 60;
  else if (titleHits.length === queryTokens.length) score += 45;
  else score += 20;

  // Secondary signals refine rank but can never carry a match on their own.
  if (phrase && desc.includes(phrase)) score += 10;

  // A query made only of generic role words ("engineer") should not rank above
  // one that named a concrete skill ("react").
  const hasSpecificToken = queryTokens.some((t) => !GENERIC_TITLE_TOKENS.has(t));
  if (!hasSpecificToken && titleHits.length < queryTokens.length) score -= 5;

  return Math.max(score, 1);
}

/**
 * Apply the caller's query/location to a board's full listing set.
 *
 * Company boards have no search API, so this is a local filter over the
 * board's own postings. It only ever NARROWS what the employer published; it
 * never fabricates or expands the set. With no query, the whole board is
 * returned, which is the honest default for "show me this company's openings".
 */
function matchesBoard(board: CompanyBoard, listing: NormalizedJob, criteria: JobSearchCriteria): boolean {
  if (boardRelevance(listing, criteria) <= 0) return false;

  const locationTokens = tokens(criteria.location);
  if (locationTokens.length === 0) return true;

  // "India" expands to the country's major hiring cities so an India-wide
  // search reaches city-labelled roles.
  const wantsIndia = locationTokens.some(isIndiaToken);
  if (wantsIndia) {
    if (isIndiaEligible(listing)) return true;
    // A board with no location data at all is kept rather than dropped: an
    // absent location is not evidence of ineligibility.
    const loc = (listing.location ?? '').trim();
    const hasAnyCountrySignal = Boolean(listing.country) || (listing.eligibleCountries?.length ?? 0) > 0;
    return loc.length === 0 && !hasAnyCountrySignal;
  }

  const haystack = `${listing.location ?? ''} ${listing.country ?? ''} ${(listing.eligibleCountries ?? []).join(' ')}`.toLowerCase();
  if (haystack.trim().length === 0) return true;
  return locationTokens.some((t) => haystack.includes(t));
}

/** Render one board's raw posting into the canonical shape. */
function normalizeBoardPosting(
  board: CompanyBoard,
  raw: Record<string, unknown>,
): NormalizedJob | null {
  const readString = (...keys: string[]): string => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  // Employer name always comes from our registry, so attribution is correct
  // even when the board payload omits or misspells the company name.
  const companyName = board.companyName;
  const title = readString('title', 'name', 'text');
  if (!title) return null;

  const rawCategories =
    typeof raw.categories === 'object' && raw.categories !== null
      ? (raw.categories as Record<string, unknown>)
      : undefined;

  // Greenhouse returns `location` as an object (`{ name }`); Lever returns a
  // string under `categories.location`. Both shapes are read explicitly rather
  // than assumed, because silently dropping location would lose country data.
  const locationObject =
    typeof raw.location === 'object' && raw.location !== null
      ? (raw.location as Record<string, unknown>)
      : undefined;
  const location =
    readString('locationName', 'city') ||
    (typeof locationObject?.name === 'string' ? locationObject.name : '') ||
    (typeof rawCategories?.location === 'string' ? rawCategories.location : '') ||
    (Array.isArray(rawCategories?.location) && typeof (rawCategories.location as unknown[])[0] === 'string'
      ? ((rawCategories.location as unknown[])[0] as string)
      : '');
  const absoluteUrl = readString('absolute_url', 'hostedUrl', 'applyUrl', 'url');
  const descriptionHtml = readString('content', 'description', 'descriptionPlain', 'additionalPlain');
  const description = stripHtml(descriptionHtml);

  const metadata = (typeof raw.metadata === 'object' && raw.metadata !== null
    ? (raw.metadata as Record<string, unknown>)
    : undefined);

  // Greenhouse/Lever expose eligible countries under different keys.
  const eligibleRaw =
    metadata?.eligibleCountries ??
    raw.eligibleCountries ??
    raw.eligible_countries;
  const eligibleCountries = Array.isArray(eligibleRaw)
    ? eligibleRaw.filter((c): c is string => typeof c === 'string').map((c) => c.toUpperCase())
    : undefined;

  // Stable, employer-side identifier for deduplication across repeated reads.
  const sourceJobId =
    readString('id', 'postingId', 'requisitionId') ||
    (absoluteUrl ? absoluteUrl : `${board.key}-${title}`);

  // Posting date and update date stay separate.
  //  - Greenhouse: `first_published` (posting) vs `updated_at` (update)
  //  - Lever:      `createdAt` (posting, epoch ms)
  // Neither is ever inferred from the moment we fetched the record.
  const postedRaw =
    metadata?.postedAt ?? raw.first_published ?? raw.posted_at ?? raw.createdAt ?? raw.created_at;
  const updatedRaw = metadata?.updatedAt ?? raw.updated_at ?? raw.updatedAt ?? raw.publishDate;

  return {
    title,
    companyName,
    location: location || undefined,
    country: eligibleCountries?.[0],
    eligibleCountries: eligibleCountries?.length ? eligibleCountries : undefined,
    remoteType: /remote/i.test(location) ? 'remote' : 'unknown',
    employmentType: /intern/i.test(title) ? 'internship' : 'unknown',
    experienceLevel: 'unknown',
    description,
    requiredSkills: [],
    preferredSkills: [],
    salaryCurrency: 'INR',
    salaryPeriod: 'yearly',
    applicationUrl: absoluteUrl || board.careersUrl,
    sourceName: board.key,
    sourceJobId: String(sourceJobId),
    sourceUrl: absoluteUrl || board.careersUrl,
    // Posting date and update date are kept separate and never inferred from
    // the moment we fetched the record.
    postedAt: sanitizeSourceDate(postedRaw),
    updatedAt: sanitizeSourceDate(updatedRaw),
  };
}

/**
 * Short-lived cache of a board's own posting set, keyed by board key.
 * See `postingsFor` below for why this exists.
 */
interface BoardCacheEntry {
  at: number;
  postings: unknown[];
}
const BOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const boardCache = new Map<string, BoardCacheEntry>();

/** Drop all cached board responses (tests, and explicit refreshes). */
export function resetCompanyBoardCache(): void {
  boardCache.clear();
}

/**
 * Aggregate first-party employer boards into one discovery source.
 *
 * Each board is fetched independently and independently bounded, so a single
 * employer whose board moved, rate-limits, or returns an invalid token cannot
 * suppress the other companies' real listings.
 */
export class CompanyBoardJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'company_board';
  readonly displayName = 'Company career boards';
  readonly requiresAuth = false;

  /**
   * Fetch one board's posting set, reusing a recent response when possible.
   *
   * Employer boards have no search API, so without this a multi-query search
   * would re-download the identical posting set once per keyword variant —
   * needless traffic against a public endpoint the employer publishes for
   * candidates. The cache is per-process, keyed by board, and expires quickly
   * so a later search still reflects the employer's live openings.
   */
  private async postingsFor(board: CompanyBoard, timeout: number): Promise<unknown[]> {
    const cached = boardCache.get(board.key);
    if (cached && Date.now() - cached.at < BOARD_CACHE_TTL_MS) return cached.postings;

    const payload = (await fetchJsonWithTimeout(
      this.endpointFor(board),
      { headers: { Accept: 'application/json' } },
      timeout,
    )) as Record<string, unknown>;

    // Each vendor wraps postings differently; unwrap defensively.
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.jobs)
        ? payload.jobs
        : Array.isArray(payload?.postings)
          ? payload.postings
          : null;

    if (!list) {
      throw new ProviderError('invalid_response', `${board.companyName} returned an unexpected shape.`);
    }

    boardCache.set(board.key, { at: Date.now(), postings: list });
    return list;
  }

  get isDisabled(): boolean {
    return getAllCompanyBoards().length === 0;
  }

  async validateConfiguration(): Promise<boolean> {
    return getAllCompanyBoards().length > 0;
  }

  async getJob(): Promise<NormalizedJob | null> {
    throw new ProviderError('unsupported', 'Company boards do not provide a single-job lookup.');
  }

  normalizeJob(): NormalizedJob {
    throw new ProviderError('unsupported', 'Company board records are normalized per board.');
  }

  /** Build the official public endpoint for one board. */
  private endpointFor(board: CompanyBoard): string {
    switch (board.provider) {
      case 'greenhouse':
        // `content=true` is deliberately NOT requested: it inflates the payload
        // 5-10x (verified: MongoDB 4.3 MB -> 819 KB) and pushed otherwise-healthy
        // boards past the request timeout. Title and metadata are what discovery
        // ranks on, and we never invent a description we did not receive.
        return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs`;
      case 'lever':
        return `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json`;
      case 'ashby':
        return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}`;
    }
  }

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    const config = getConfig();
    const boards = getAllCompanyBoards();
    if (boards.length === 0) {
      throw new ProviderError('not_configured', 'No company boards are configured.');
    }

    // Company boards get their own budget: Lever's public endpoint is measured
    // at ~3.5 s for a full posting set, so the generic provider timeout would
    // discard healthy boards.
    const timeout = config.COMPANY_BOARD_TIMEOUT_MS;

    const settled = await Promise.all(
      boards.map(async (board) => {
        try {
          // Reuses a recent response so a multi-query search does not
          // re-download the identical posting set once per keyword variant.
          const rawList = await this.postingsFor(board, timeout);

          const jobs = rawList
            .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
            .map((raw) => normalizeBoardPosting(board, raw))
            .filter((j): j is NormalizedJob => j !== null)
            .filter((job) => matchesBoard(board, job, criteria));

          return { board, jobs };
        } catch (error) {
          if (error instanceof ProviderError && error.code === 'rate_limited') throw error;
          // An invalid or unreachable board is skipped; other boards continue.
          return { board, jobs: [] as NormalizedJob[] };
        }
      }),
    );

    const jobs = settled.flatMap((s) => s.jobs);

    // Attribution: expose which employer board actually published each listing.
    return {
      jobs,
      total: jobs.length,
      page: criteria.page ?? 1,
      pageSize: criteria.pageSize ?? jobs.length,
      totalPages: 1,
    };
  }
}

export const companyBoardJobSource = new CompanyBoardJobSource();

/** Read a board's listing count for diagnostics, without credentials. */
export async function probeBoard(board: CompanyBoard): Promise<{ ok: boolean; count?: number; reason?: string }> {
  try {
    const payload = (await fetchJsonWithTimeout(
      companyBoardJobSource['endpointFor'](board),
      { headers: { Accept: 'application/json' } },
      8000,
    )) as Record<string, unknown>;
    const list = Array.isArray(payload) ? payload
      : Array.isArray(payload?.jobs) ? payload.jobs
      : Array.isArray(payload?.postings) ? payload.postings
      : [];
    return { ok: true, count: toNumber((payload as { count?: unknown })?.count) ?? list.length };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unreachable' };
  }
}

