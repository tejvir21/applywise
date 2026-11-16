/**
 * Deduplication across sources and across the expanded keyword queries.
 *
 * Two listings are the same when they share:
 *  - the same stable internal id (`${sourceProvider}:${externalId}`), or
 *  - the same canonical listing URL (protocol/whitespace/tracking-param
 *    normalized), so the same vacancy syndicated by two providers collapses.
 */

import type { DiscoveredJob } from './types.js';

/** Canonicalize a listing URL for cross-source comparison. */
export function canonicalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase() || undefined;
  }
  // Drop tracking/ref params; keep the page path meaningful.
  const tracking = /^(gh_)?(ref|refid|utm_\w+|gh_jid|lever-source|source|sid|sid1|via|trk)$/i;
  for (const key of Array.from(u.searchParams.keys())) {
    if (tracking.test(key)) u.searchParams.delete(key);
  }
  u.protocol = 'https:';
  u.hash = '';
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.host.toLowerCase()}${path}${u.searchParams.toString() ? `?${u.search}` : ''}`;
}

export interface DedupeResult {
  jobs: DiscoveredJob[];
  removedCount: number;
}

/** Deduplicate by internal id then canonical URL, preserving first occurrence. */
export function dedupe(jobs: DiscoveredJob[]): DedupeResult {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const out: DiscoveredJob[] = [];
  let removed = 0;

  for (const job of jobs) {
    const idKey = job.dedupeKey || `${job.sourceProvider}:${job.externalId}`;
    const urlKey = canonicalizeUrl(job.canonicalUrl);
    if (seenIds.has(idKey)) {
      removed += 1;
      continue;
    }
    if (urlKey && seenUrls.has(urlKey)) {
      removed += 1;
      continue;
    }
    seenIds.add(idKey);
    if (urlKey) seenUrls.add(urlKey);
    out.push(job);
  }
  return { jobs: out, removedCount: removed };
}
