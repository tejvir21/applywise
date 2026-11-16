/**
 * Freshness policy for discovered job listings.
 *
 * Three distinct dates are tracked and never conflated:
 *  - `postedAt`  : when the vacancy was published (source-provided)
 *  - `updatedAt` : when the source last updated the listing (source-provided)
 *  - `fetchedAt` : when ApplyWise retrieved it (always known, never a proxy
 *                  for the posting date)
 *
 * Rules that this module enforces:
 *  - The retrieval date is NEVER substituted for the posting date.
 *  - Undated listings are kept and labelled, never silently dropped.
 *  - Future or malformed timestamps are rejected defensively rather than being
 *    rendered as if they were real publication dates.
 *  - No hard cutoff is applied by default; callers opt in via a window.
 */

/** Maximum age, in days, before a listing is flagged as an older listing. */
export const OLD_LISTING_DAYS = 30;

/** Age within which a listing is considered recent (Phase 3 preference). */
export const RECENT_LISTING_DAYS = 7;

/** User-selectable freshness windows. `any` disables date filtering entirely. */
export type FreshnessWindow = 'any' | '7d' | '14d' | '30d';

export const FRESHNESS_WINDOWS: FreshnessWindow[] = ['any', '7d', '14d', '30d'];

const WINDOW_DAYS: Record<Exclude<FreshnessWindow, 'any'>, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

/**
 * Parse a source-provided date defensively.
 *
 * Returns undefined for absent, malformed, or future-dated values. A future
 * timestamp is rejected because it is more likely a timezone/parse error than
 * a genuine "posted in the future" vacancy, and showing it would imply the role
 * is brand new when we cannot know that.
 */
export function sanitizeSourceDate(value: unknown, now: Date = new Date()): Date | undefined {
  let parsed: Date | undefined;

  if (value instanceof Date) {
    parsed = Number.isNaN(value.getTime()) ? undefined : value;
  } else if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    parsed = Number.isNaN(d.getTime()) ? undefined : d;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    // Guard against second- vs millisecond-scale epochs.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    parsed = Number.isNaN(d.getTime()) ? undefined : d;
  }

  if (!parsed) return undefined;
  // Allow a small clock-skew tolerance, reject anything clearly in the future.
  if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return undefined;
  return parsed;
}

/**
 * Age of a listing in whole days, or null when the source gave no usable date.
 * Undated listings must be labelled, not treated as infinitely old.
 */
export function postingAgeDays(postedAt?: Date | null, now: Date = new Date()): number | null {
  if (!postedAt) return null;
  const ms = now.getTime() - postedAt.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/** True when the listing is older than the "older listing" threshold. */
export function isOlderListing(postedAt?: Date | null, now: Date = new Date()): boolean {
  const age = postingAgeDays(postedAt, now);
  return age !== null && age > OLD_LISTING_DAYS;
}

/**
 * Whether a listing passes the requested freshness window.
 *
 * Undated listings always pass: an unknown date is not evidence of staleness,
 * and dropping them would silently hide valid vacancies. `any` passes
 * everything. The caller is responsible for labelling undated results.
 */
export function passesFreshness(
  postedAt: Date | undefined,
  window: FreshnessWindow,
  now: Date = new Date(),
): boolean {
  if (window === 'any') return true;
  const age = postingAgeDays(postedAt, now);
  // Unknown date: keep it, and let the UI label it "Posting date unavailable".
  if (age === null) return true;
  return age <= WINDOW_DAYS[window];
}

/** Days represented by a window, for display ("Last 7 days"). */
export function windowLabel(window: FreshnessWindow): string {
  switch (window) {
    case 'any':
      return 'Any date';
    case '7d':
      return 'Last 7 days';
    case '14d':
      return 'Last 14 days';
    case '30d':
      return 'Last 30 days';
    default:
      return 'Any date';
  }
}

/**
 * Human-readable date state for the UI. Never invents a date.
 * Distinguishes: recent, older, undated.
 */
export type DateState = 'recent' | 'older' | 'undated';

export function classifyDate(postedAt: Date | undefined, now: Date = new Date()): DateState {
  if (!postedAt) return 'undated';
  return isOlderListing(postedAt, now) ? 'older' : 'recent';
}

/** Summary counts used to report the freshness distribution honestly. */
export interface FreshnessBreakdown {
  total: number;
  recent: number;
  older: number;
  undated: number;
  /** True when the caller asked for more than the sources could supply. */
  truncated: boolean;
}

export function summarizeFreshness(
  listings: Array<{ postedAt?: Date }>,
  now: Date = new Date(),
): Omit<FreshnessBreakdown, 'truncated'> {
  let recent = 0;
  let older = 0;
  let undated = 0;
  for (const l of listings) {
    const state = classifyDate(l.postedAt, now);
    if (state === 'recent') recent += 1;
    else if (state === 'older') older += 1;
    else undated += 1;
  }
  return { total: listings.length, recent, older, undated };
}

/** Normalize an untrusted query-string value into a supported window. */
export function parseFreshnessWindow(value: unknown): FreshnessWindow {
  if (typeof value !== 'string') return 'any';
  const normalized = value.trim().toLowerCase();
  return (FRESHNESS_WINDOWS as string[]).includes(normalized)
    ? (normalized as FreshnessWindow)
    : 'any';
}
