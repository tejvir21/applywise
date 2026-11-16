/**
 * Shared helpers for external job-source providers.
 *
 * These exist so every adapter applies the same safety rules: only real HTTP(S)
 * URLs are kept, descriptions are sanitized to plain text, upstream bodies are
 * never leaked to clients, and a provider whose terms request infrequent
 * polling is throttled instead of hammered.
 */

import type { JobSearchCriteria } from './JobSourceAdapter.js';

/**
 * Accept only absolute http/https URLs. Rejects javascript:, data:, file:,
 * relative and malformed values so a hostile or malformed upstream record can
 * never become a clickable link or an SSRF-style target in the UI.
 */
export function sanitizeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  return parsed.toString();
}

/**
 * Convert an HTML description to plain text. Provider feeds return HTML in
 * `contents`/`description`; rendering that raw would be an injection risk and
 * would distort the matching engine's text analysis.
 */
export function stripHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : undefined;
}

/** Best-effort numeric parse that returns undefined rather than NaN/0. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    // Strip common currency symbols, commas, and spacing before parsing.
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Parse a date defensively; malformed or absent dates become undefined. */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

/** Clamp provider result counts to a safe, bounded page size. */
export function clampPageSize(pageSize: number | undefined, max: number, fallback = 20): number {
  const value = pageSize ?? fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

/**
 * Error thrown by a provider adapter. Carries a stable `code` and a
 * user-safe message. The upstream response body is intentionally NOT retained
 * on the thrown error so it cannot leak secrets or internal detail.
 */
export class ProviderError extends Error {
  readonly code:
    | 'not_configured'
    | 'timeout'
    | 'rate_limited'
    | 'upstream_error'
    | 'invalid_response'
    | 'disabled'
    | 'unsupported';

  constructor(
    code: ProviderError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/**
 * Fetch JSON from an upstream API with a hard timeout and abort on signal.
 * Throws a `ProviderError` on timeout / HTTP / JSON failure — never exposes the
 * raw upstream body.
 */
export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      throw new ProviderError('rate_limited', 'Provider rate limit reached. Try again later.');
    }
    if (!response.ok) {
      // Verified live against Adzuna: a rejected key returns 401 with
      // `{"exception":"AUTH_FAIL"}`. That is a genuine configuration problem.
      if (response.status === 401) {
        throw new ProviderError(
          'not_configured',
          'Provider rejected the configured credentials.',
        );
      }
      // 403 is NOT proof of bad configuration. Verified live against Jooble:
      // a valid key still returns 403 because the endpoint sits behind
      // Cloudflare bot protection. Report this as an access/upstream failure so
      // it is never mislabelled as a missing credential.
      if (response.status === 403) {
        throw new ProviderError(
          'upstream_error',
          'Provider blocked the request (HTTP 403). The API may be bot-protected or unavailable.',
        );
      }
      throw new ProviderError('upstream_error', `Provider returned HTTP ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError('invalid_response', 'Provider returned a non-JSON response.');
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message))) {
      throw new ProviderError('timeout', `Provider timed out after ${timeoutMs}ms.`);
    }
    // Network/DNS failures are reported generically; no stack or raw message.
    throw new ProviderError('upstream_error', 'Provider request failed.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Per-process cooldown used to honor providers whose terms request infrequent
 * polling (Remotive advises ~4 fetches/day). This is intentionally in-process
 * and best-effort: it protects a single running server instance, not a fleet.
 * A multi-instance deployment should move this to shared storage.
 */
export class CooldownGuard {
  private lastCall = new Map<string, number>();

  /** @returns ms remaining, or 0 when the action may proceed. */
  remainingMs(key: string, minIntervalMs: number): number {
    if (minIntervalMs <= 0) return 0;
    const last = this.lastCall.get(key);
    if (last === undefined) return 0;
    const elapsed = Date.now() - last;
    return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
  }

  markCalled(key: string): void {
    this.lastCall.set(key, Date.now());
  }

  /** Forget a key's last-call time. Used by tests and explicit resets. */
  reset(key: string): void {
    this.lastCall.delete(key);
  }
}

/** Normalize a free-text location filter into a lowercase token for matching. */
export function normalizeLocationToken(location: string): string {
  return location.toLowerCase().trim();
}

/** Generic words that should not carry relevance signal on their own. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'at', 'to', 'for', 'with',
  'job', 'jobs', 'role', 'position', 'developer', 'engineer', 'dev',
  'we', 'are', 'looking', 'join', 'our', 'team', 'work', 'any', 'all',
]);

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Score how well a listing matches a free-text query, 0-100.
 *
 * Designed to RANK, not to exclude. A provider's own search may return
 * broadly-related roles ("Tier III Service Desk Engineer" for a
 * "React Developer" query). We keep those results but rank the ones whose
 * title genuinely reflects the query above loosely related ones, rather than
 * dropping valid variants such as "Senior React Developer".
 *
 * Title matches weigh far more than description matches because the title is
 * the candidate's primary relevance signal.
 */
export function relevanceScore(job: { title: string; companyName?: string; description?: string }, query?: string): number {
  if (!query || !query.trim()) return 0;

  const title = (job.title ?? '').toLowerCase();
  const desc = (job.description ?? '').toLowerCase();
  const phrase = query.trim().toLowerCase();

  let score = 0;
  // Exact phrase in the title is the strongest signal.
  if (title.includes(phrase)) score += 60;
  else {
    // Every meaningful token present in the title.
    const tokens = tokenizeQuery(query);
    if (tokens.length > 0) {
      const hits = tokens.filter((t) => title.includes(t)).length;
      if (hits === tokens.length) score += 45;
      else if (hits > 0) score += Math.round((hits / tokens.length) * 30);
    }
  }
  // Secondary signals add credit but never dominate.
  if (desc.includes(phrase)) score += 15;
  if ((job.companyName ?? '').toLowerCase().includes(phrase)) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Run an async mapper over items with a bounded number of concurrent calls.
 *
 * Providers have quotas, so a multi-page read must never open an unbounded
 * number of simultaneous requests. Results are returned in input order.
 * The first rejection propagates once in-flight work settles.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const bounded = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(bounded, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Canonical key for deduplicating a listing across providers/pages.
 *
 * Prefers the provider's stable external id, then falls back to a normalized
 * canonical listing URL, then to title+company. Tracking-page query strings
 * (e.g. Adzuna's `?utm_medium=api`) are stripped so the same job linked from
 * two feeds collapses to one row.
 */
export function listingDedupeKey(listing: {
  sourceName: string;
  sourceJobId?: string;
  sourceUrl?: string;
  applicationUrl?: string;
  title?: string;
  companyName?: string;
}): string {
  if (listing.sourceJobId && listing.sourceJobId.length > 0) {
    return `${listing.sourceName}:${listing.sourceJobId}`;
  }
  const url = listing.sourceUrl ?? listing.applicationUrl;
  if (url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      // Sort params so parameter order does not defeat deduplication.
      parsed.searchParams.sort();
      return `url:${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      /* fall through to the text key */
    }
  }
  const title = (listing.title ?? '').toLowerCase().trim();
  const company = (listing.companyName ?? '').toLowerCase().trim();
  return `text:${company}|${title}`;
}

/** Cap a provider criteria page size by its own (possibly smaller) max. */
export function criteriaPageSize(criteria: JobSearchCriteria, max: number): number {
  return clampPageSize(criteria.pageSize, max);
}