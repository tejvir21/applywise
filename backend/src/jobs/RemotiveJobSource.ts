/**
 * Remotive remote-jobs provider.
 *
 * Endpoint verified live:
 *   GET https://remotive.com/api/remote-jobs?search=&limit=
 * Returns `{job-count, total-job-count, jobs[]}` where each job carries `id`,
 * `title`, `company_name`, `candidate_required_location`, `job_type`,
 * `publication_date`, `url` (the original Remotive listing), `tags`,
 * `category`, `description` (HTML), and an optional `salary` string.
 *
 * TERMS COMPLIANCE (from the API's own `0-legal-notice`, verified live):
 *  - We MUST link back to the Remotive listing URL and name Remotive as the
 *    source, or access is terminated. This provider therefore always sets
 *    `sourceName: 'remotive'` and `sourceUrl`/`applicationUrl` to the original
 *    Remotive URL, and the UI renders explicit attribution + a link out.
 *  - We MUST NOT submit Remotive jobs to third-party job sites. ApplyWise is a
 *    private, per-user tool and never republishes a feed, so this is honored.
 *  - Excessive requests are blocked; they advise at most ~4 fetches/day. A
 *    per-process cooldown (default ~6h) enforces that.
 *
 * Because these constraints are real, this adapter defaults to a long cooldown
 * and a reduced result cap.
 */

import { getConfig } from '../config/index.js';
import {
  BaseJobSourceAdapter,
  type JobSearchCriteria,
  type JobSearchResult,
  type NormalizedJob,
} from './JobSourceAdapter.js';
import {
  CooldownGuard,
  ProviderError,
  clampPageSize,
  fetchJsonWithTimeout,
  sanitizeHttpUrl,
  stripHtml,
  toDate,
  toNumber,
} from './providerUtils.js';

interface RemotiveRawJob {
  id?: unknown;
  title?: unknown;
  company_name?: unknown;
  candidate_required_location?: unknown;
  job_type?: unknown;
  publication_date?: unknown;
  url?: unknown;
  tags?: unknown;
  category?: unknown;
  description?: unknown;
  salary?: unknown;
}

interface RemotiveResponse {
  jobs?: RemotiveRawJob[];
  'job-count'?: unknown;
  'total-job-count'?: unknown;
}

// Per-process cooldown shared across requests (Remotive: ~4 fetches/day).
const remotiveCooldown = new CooldownGuard();
const COOLDOWN_KEY = 'remotive';

/**
 * Reset the in-process cooldown. Exposed for deterministic tests and for an
 * operator-triggered reset; production code never needs to call it.
 */
export function resetRemotiveCooldown(): void {
  remotiveCooldown.reset(COOLDOWN_KEY);
}

export class RemotiveJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'remotive';
  readonly displayName = 'Remotive';
  readonly requiresAuth = false;

  /** Lets the discovery layer distinguish "off" from "missing credentials". */
  get isDisabled(): boolean {
    return !getConfig().REMOTIVE_ENABLED;
  }

  async validateConfiguration(): Promise<boolean> {
    return getConfig().REMOTIVE_ENABLED;
  }

  async getJob(): Promise<NormalizedJob | null> {
    throw new ProviderError('unsupported', 'Remotive does not provide a single-job lookup.');
  }

  normalizeJob(rawJob: unknown): NormalizedJob {
    const raw = rawJob as RemotiveRawJob;
    const externalId = raw?.id !== undefined && raw?.id !== null ? String(raw.id) : '';
    // The original Remotive listing URL — required by their terms and used for
    // both `sourceUrl` (attribution) and `applicationUrl` (link-back).
    const listingUrl = sanitizeHttpUrl(raw?.url);
    const description = stripHtml(raw?.description);

    const location = typeof raw?.candidate_required_location === 'string' ? raw.candidate_required_location : undefined;
    const jobType = typeof raw?.job_type === 'string' ? raw.job_type : '';

    // Remotive is a remote-jobs board: listings are remote unless stated.
    const remoteType = this.normalizeRemoteType(location ? 'remote' : '');

    // Remotive is a remote-first board: treat the job type as employment type.
    const employmentType =
      jobType === 'full_time' || jobType === 'part_time' || jobType === 'contract' ||
      jobType === 'internship' || jobType === 'freelance'
        ? this.normalizeEmploymentType(jobType)
        : 'unknown';

    // Salary, when supplied, is an object with min/max and currency; treat
    // absent/empty values as unknown rather than guessing.
    let salaryMin: number | undefined;
    let salaryMax: number | undefined;
    let salaryCurrency = 'USD';
    const salary = raw?.salary as { min?: unknown; max?: unknown; currency?: unknown } | undefined;
    if (salary && typeof salary === 'object') {
      salaryMin = toNumber(salary.min);
      salaryMax = toNumber(salary.max);
      if (typeof salary.currency === 'string' && salary.currency) salaryCurrency = salary.currency.toUpperCase();
    }

    return {
      title: typeof raw?.title === 'string' ? raw.title.trim() : '',
      companyName: typeof raw?.company_name === 'string' ? raw.company_name.trim() : '',
      location,
      remoteType,
      employmentType,
      experienceLevel: 'unknown',
      description,
      // Remotive `tags` are topical, not required-vs-preferred; record as
      // preferred so the matcher's existing missing-data policy applies.
      requiredSkills: [],
      preferredSkills: this.normalizeSkills(
        Array.isArray(raw?.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
      ),
      ...(salaryMin !== undefined ? { salaryMin } : {}),
      ...(salaryMax !== undefined ? { salaryMax } : {}),
      salaryCurrency,
      salaryPeriod: 'yearly',
      applicationUrl: listingUrl,
      sourceName: this.sourceName,
      sourceJobId: externalId,
      sourceUrl: listingUrl,
      postedAt: toDate(raw?.publication_date),
    };
  }

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    const config = getConfig();
    if (!config.REMOTIVE_ENABLED) {
      throw new ProviderError('disabled', 'Remotive is disabled by configuration.');
    }

    // Respect their request-rate guidance with a per-process cooldown.
    const remaining = remotiveCooldown.remainingMs(COOLDOWN_KEY, config.REMOTIVE_MIN_INTERVAL_MS);
    if (remaining > 0) {
      const hours = Math.ceil(remaining / 3_600_000);
      throw new ProviderError(
        'rate_limited',
        `Remotive limits polling (advises ~4 fetches/day). Retry in ~${hours}h.`,
      );
    }

    // Remotive caps `limit`; keep it modest to limit load on their feed.
    const limit = clampPageSize(criteria.pageSize, 50, Math.min(config.JOB_PROVIDER_MAX_RESULTS, 20));
    const params = new URLSearchParams({ limit: String(limit) });
    if (criteria.query) params.set('search', criteria.query);
    if (criteria.location) params.set('location', criteria.location);
    // Remotive is remote-first; only include remote_only when asked.
    if (criteria.remoteType === 'remote') params.set('remote_only', 'true');

    const url = `https://remotive.com/api/remote-jobs?${params.toString()}`;
    remotiveCooldown.markCalled(COOLDOWN_KEY);

    const payload = (await fetchJsonWithTimeout(
      url,
      { headers: { Accept: 'application/json' } },
      config.JOB_PROVIDER_TIMEOUT_MS,
    )) as RemotiveResponse;

    const rawJobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    const jobs = rawJobs
      .map((raw) => this.normalizeJob(raw))
      .filter((job) => job.title.length > 0 && job.companyName.length > 0 && job.sourceJobId.length > 0);

    const total = toNumber(payload?.['total-job-count']) ?? toNumber(payload?.['job-count']) ?? jobs.length;

    return {
      jobs,
      total,
      page: 1, // Remotive's feed is not page-addressable via this endpoint.
      pageSize: limit,
      totalPages: 1,
    };
  }
}

export const remotiveJobSource = new RemotiveJobSource();