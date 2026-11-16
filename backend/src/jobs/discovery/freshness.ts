/**
 * Freshness policy.
 *
 * Explicit, defensive, and honest about dates:
 *  - posting date, source update date, and fetch date are kept separate
 *  - malformed / future / unreliable timestamps are never treated as fresh
 *  - undated listings are labeled "Posting date unavailable", never silently
 *    dropped and never fabricated to look recent
 */

import type { DateConfidence, Freshness } from './types.js';

/** Tolerance: a "future" date beyond this is considered unreliable. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * Parse a value into a Date, defensively.
 * Accepts Date, epoch-ms number, or ISO/RFC string. Returns undefined for
 * null/undefined/NaN. Does NOT reject future dates here (caller decides).
 */
export function parseDate(value: unknown): Date | undefined {
  if (value == null) return undefined;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'number') d = new Date(value);
  else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    d = new Date(trimmed);
  } else return undefined;
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * A trustworthy *posting* date: defined, not in the future (beyond tolerance).
 * Anything else is treated as unavailable for freshness purposes.
 */
export function reliablePostedDate(value: unknown, now = Date.now()): Date | undefined {
  const d = parseDate(value);
  if (!d) return undefined;
  if (d.getTime() - now > FUTURE_TOLERANCE_MS) return undefined;
  return d;
}

export interface FreshnessFlags {
  dateConfidence: DateConfidence;
  isNewWithin7?: boolean;
  olderListing?: boolean;
}

/** Derive freshness flags from a (reliable) posting date. */
export function classifyFreshness(postedAt: Date | undefined, now = Date.now()): FreshnessFlags {
  if (!postedAt) {
    return { dateConfidence: 'unavailable' };
  }
  const ageDays = (now - postedAt.getTime()) / (24 * 60 * 60 * 1000);
  const flags: FreshnessFlags = { dateConfidence: 'reliable' };
  if (ageDays <= 7) flags.isNewWithin7 = true;
  if (ageDays > 30) flags.olderListing = true;
  return flags;
}

/**
 * Does a listing satisfy the freshness filter?
 *  - 'any'      -> always pass (undated included)
 *  - last7/14/30-> pass only if a reliable postedAt within the window exists.
 * Undated (no reliable date) never satisfies a bounded window. The caller is
 * expected to still COUNT undated listings so they are not dropped silently.
 */
export function passesFreshness(
  postedAt: Date | undefined,
  freshness: Freshness,
  now = Date.now(),
): boolean {
  if (freshness === 'any') return true;
  if (!postedAt) return false;
  const ageDays = (now - postedAt.getTime()) / (24 * 60 * 60 * 1000);
  const window = freshness === 'last7' ? 7 : freshness === 'last14' ? 14 : 30;
  return ageDays >= 0 && ageDays <= window;
}

/** Cutoff date for a freshness filter, or undefined for 'any'. */
export function freshnessCutoff(freshness: Freshness, now = Date.now()): Date | undefined {
  if (freshness === 'any') return undefined;
  const window = freshness === 'last7' ? 7 : freshness === 'last14' ? 14 : 30;
  return new Date(now - window * 24 * 60 * 60 * 1000);
}
