/**
 * Duplicate job detection (Phase 8.3.7).
 *
 * Detects duplicate job postings using, in priority order:
 *  1. Same platform + same sourceJobId (exact identifier).
 *  2. Same canonical application URL.
 *  3. Conservative similarity (title + company + location all close).
 *
 * Returns a typed decision. Similarity is intentionally conservative: same
 * company + similar title is NOT enough, different locations are not merged,
 * and different source job IDs are never ignored.
 */

import { Types } from 'mongoose';
import { IJob } from '../models/Job.js';

export type DuplicateMatchKind =
  | 'EXACT_SOURCE_ID'
  | 'CANONICAL_URL'
  | 'HIGH_CONFIDENCE_SIMILARITY'
  | 'REVIEW_REQUIRED'
  | 'NO_DUPLICATE';

export interface DuplicateMatch {
  kind: DuplicateMatchKind;
  confidence: 'high' | 'medium' | 'low';
  existingJobId: string;
  reason: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  match: DuplicateMatch | null;
}

/** Tracking/ref/query parameters that do not identify a specific vacancy. */
const TRACKING_PARAMS = /^(utm_\w+|gh_jid|gh_sid|lever-source|ref|refid|source|sid|sid1|via|trk|campaign|medium|content|term)$/i;

function norm(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(/[^a-z0-9+#.]+/).filter((t) => t.length > 0));
}

/** Canonicalize a listing URL for cross-source comparison. */
export function canonicalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase() || undefined;
  }
  for (const key of Array.from(u.searchParams.keys())) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.protocol = 'https:';
  u.hash = '';
  u.username = '';
  u.password = '';
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const search = u.searchParams.toString();
  return `${u.host.toLowerCase()}${path}${search ? `?${search}` : ''}`;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function normalizeCompany(name: string): string {
  return norm(name)
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|ag|sa|plc)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarityScore(
  a: JobLike,
  b: JobLike,
  urlMatch: boolean,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const titleA = tokenSet(norm(String(a.title ?? '')));
  const titleB = tokenSet(norm(String(b.title ?? '')));
  const titleSim = jaccard(titleA, titleB);
  if (titleSim >= 0.8) {
    score += 30;
    reasons.push('similar title');
  } else if (titleSim >= 0.6) {
    score += 12;
    reasons.push('somewhat similar title');
  }

  const companyA = normalizeCompany(String(a.companyName ?? ''));
  const companyB = normalizeCompany(String(b.companyName ?? ''));
  if (companyA && companyA === companyB) {
    score += 30;
    reasons.push('same company');
  } else if (companyA && companyB && jaccard(tokenSet(companyA), tokenSet(companyB)) >= 0.75) {
    score += 12;
    reasons.push('similar company');
  }

  const locA = norm(String(a.location ?? a.city ?? a.state ?? a.country ?? ''));
  const locB = norm(String(b.location ?? b.city ?? b.state ?? b.country ?? ''));
  if (locA && locA === locB) {
    score += 25;
    reasons.push('same location');
  } else if (locA && locB && jaccard(tokenSet(locA), tokenSet(locB)) >= 0.75) {
    score += 10;
    reasons.push('similar location');
  } else if ((locA || locB) && !(locA && locB)) {
    score += 5;
  }

  const typeA = norm(String(a.employmentType ?? ''));
  const typeB = norm(String(b.employmentType ?? ''));
  if (typeA && typeA === typeB) {
    score += 10;
    reasons.push('same employment type');
  }

  return {
    score: Math.min(urlMatch ? 100 : 65, score),
    reasons,
  };
}

export interface DuplicateDetectionInput {
  source?: string;
  sourceJobId?: string;
  applicationUrl?: string;
  title: string;
  companyName: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType?: string;
  employmentType?: string;
}

/**
 * Evaluate whether `candidate` duplicates any job in `existing`.
 * Scoped to a single user's jobs when userId is provided (manual entries),
 * otherwise global (imported/shared jobs).
 */
export async function findDuplicate(
  candidate: DuplicateDetectionInput,
  existing: IJob[],
): Promise<DuplicateDetectionResult> {
  const canonUrl = canonicalizeUrl(candidate.applicationUrl);

  // ---- Level 1: exact source identifier ----
  if (candidate.source && candidate.sourceJobId) {
    const exact = existing.find(
      (j) =>
        (j.sources ?? []).some(
          (s) =>
            norm(s.name) === norm(candidate.source) &&
            s.sourceJobId &&
            norm(s.sourceJobId) === norm(candidate.sourceJobId),
        ),
    );
    if (exact) {
      return {
        isDuplicate: true,
        match: {
          kind: 'EXACT_SOURCE_ID',
          confidence: 'high',
          existingJobId: exact._id.toString(),
          reason: `Same source '${candidate.source}' and source job ID '${candidate.sourceJobId}'`,
        },
      };
    }
  }

  // ---- Level 2: canonical URL ----
  if (canonUrl) {
    const locA = norm(candidate.location ?? candidate.city ?? candidate.state ?? candidate.country);
    const byUrl = existing.find((j) => {
      const urlMatch =
        canonicalizeUrl(j.applicationUrl) === canonUrl ||
        (j.sources ?? []).some((s) => canonicalizeUrl(s.sourceUrl) === canonUrl);
      if (!urlMatch) return false;
      const locB = norm(j.location ?? j.city ?? j.state ?? j.country);
      // Only treat as a URL duplicate when locations agree (or both are
      // absent), so the same URL posted for different locations stays distinct.
      if (locA && locB) return locA === locB;
      return !locA && !locB;
    });
    if (byUrl) {
      return {
        isDuplicate: true,
        match: {
          kind: 'CANONICAL_URL',
          confidence: 'high',
          existingJobId: byUrl._id.toString(),
          reason: 'Same canonical application URL',
        },
      };
    }
  }

  // ---- Level 3: conservative similarity ----
  const best = existing.reduce<{ job: IJob; score: number; reasons: string[] } | null>(
    (acc, j) => {
      const ca = canonicalizeUrl(candidate.applicationUrl);
    const cb = canonicalizeUrl(j.applicationUrl);
    const urlMatch = ca === cb || ca === undefined || cb === undefined;
    const r = similarityScore(candidate, j, urlMatch);
      if (!acc || r.score > acc.score) return { job: j, score: r.score, reasons: r.reasons };
      return acc;
    },
    null,
  );

  if (best && best.score >= 75) {
    return {
      isDuplicate: true,
      match: {
        kind: 'HIGH_CONFIDENCE_SIMILARITY',
        confidence: best.score >= 90 ? 'high' : 'medium',
        existingJobId: best.job._id.toString(),
        reason: `Similar posting (${best.reasons.join(', ')})`,
      },
    };
  }

  if (best && best.score >= 50) {
    return {
      isDuplicate: false,
      match: {
        kind: 'REVIEW_REQUIRED',
        confidence: 'low',
        existingJobId: best.job._id.toString(),
        reason: `Possibly similar posting (${best.reasons.join(', ')})`,
      },
    };
  }

  return { isDuplicate: false, match: null };
}

export interface JobLike {
  title?: string;
  companyName?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  remoteType?: string;
  employmentType?: string;
  applicationUrl?: string;
  sources?: Array<{ name?: string; sourceJobId?: string; sourceUrl?: string }>;
}

/**
 * Build a candidate input from a normalized job object.
 */
export function candidateFromJob(job: JobLike): DuplicateDetectionInput {
  const sources: Array<{ name?: string; sourceJobId?: string; sourceUrl?: string } | undefined> = Array.isArray(
    job.sources,
  )
    ? job.sources
    : [];
  const first = sources[0];
  return {
    source: typeof first?.name === 'string' ? first.name : undefined,
    sourceJobId: typeof first?.sourceJobId === 'string' ? first.sourceJobId : undefined,
    applicationUrl:
      typeof job.applicationUrl === 'string'
        ? job.applicationUrl
        : typeof first?.sourceUrl === 'string'
        ? first.sourceUrl
        : undefined,
    title: typeof job.title === 'string' ? job.title : '',
    companyName: typeof job.companyName === 'string' ? job.companyName : '',
    location: typeof job.location === 'string' ? job.location : undefined,
    city: typeof job.city === 'string' ? job.city : undefined,
    state: typeof job.state === 'string' ? job.state : undefined,
    country: typeof job.country === 'string' ? job.country : undefined,
    remoteType: typeof job.remoteType === 'string' ? job.remoteType : undefined,
    employmentType: typeof job.employmentType === 'string' ? job.employmentType : undefined,
  };
}
