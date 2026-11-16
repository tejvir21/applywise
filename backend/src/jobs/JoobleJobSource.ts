/**
 * Jooble job-search provider.
 *
 * Jooble exposes a key-scoped, per-market JSON API reached by POSTing a search
 * body to `https://jooble.org/api/{key}` (mirrored at `api.jooble.org`). The
 * key is tied to the purchased market/region, so one key does not cover all
 * countries — JOOBLE_API_KEY must correspond to the market you intend to search.
 *
 * ACCESS NOTES (verified while building this):
 *  - `jooble.org` sits behind Cloudflare bot protection, and the API host
 *    `api.jooble.org` did not resolve from the build environment. A live
 *    end-to-end call could therefore NOT be confirmed here.
 *  - Jooble requires a paid, per-market key. Without one the adapter reports
 *    "not configured" and is skipped — it never fabricates results.
 *
 * The adapter is implemented to the documented POST shape so it becomes usable
 * once a valid key is supplied. Treat it as UNVERIFIED against the live API
 * until a real request succeeds.
 */

import { getConfig } from '../config/index.js';
import {
  BaseJobSourceAdapter,
  type JobSearchCriteria,
  type JobSearchResult,
  type NormalizedJob,
} from './JobSourceAdapter.js';
import {
  ProviderError,
  clampPageSize,
  fetchJsonWithTimeout,
  sanitizeHttpUrl,
  stripHtml,
  toDate,
} from './providerUtils.js';

interface JoobleRawJob {
  id?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  description?: unknown;
  url?: unknown;
  created?: unknown;
  type?: unknown;
  salary?: unknown;
}

export class JoobleJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'jooble';
  readonly displayName = 'Jooble';
  readonly requiresAuth = true;

  /** Lets the discovery layer distinguish "off" from "missing credentials". */
  get isDisabled(): boolean {
    return !getConfig().JOOBLE_ENABLED;
  }

  async validateConfiguration(): Promise<boolean> {
    const config = getConfig();
    return Boolean(config.JOOBLE_ENABLED && config.JOOBLE_API_KEY);
  }

  async getJob(): Promise<NormalizedJob | null> {
    throw new ProviderError('unsupported', 'Jooble does not provide a single-job lookup.');
  }

  normalizeJob(rawJob: unknown): NormalizedJob {
    const raw = rawJob as JoobleRawJob;
    const externalId = raw?.id !== undefined && raw?.id !== null ? String(raw.id) : '';
    const listingUrl = sanitizeHttpUrl(raw?.url);
    const description = stripHtml(raw?.description);

    return {
      title: typeof raw?.title === 'string' ? raw.title.trim() : '',
      companyName: typeof raw?.company === 'string' ? raw.company.trim() : '',
      location: typeof raw?.location === 'string' ? raw.location : undefined,
      remoteType: 'unknown',
      employmentType: this.normalizeEmploymentType(typeof raw?.type === 'string' ? raw.type : ''),
      experienceLevel: 'unknown',
      description,
      requiredSkills: [],
      preferredSkills: [],
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
      applicationUrl: listingUrl,
      sourceName: this.sourceName,
      sourceJobId: externalId,
      sourceUrl: listingUrl,
      postedAt: toDate(raw?.created),
    };
  }

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    const config = getConfig();
    if (!config.JOOBLE_ENABLED) {
      throw new ProviderError('disabled', 'Jooble is disabled by configuration.');
    }
    if (!config.JOOBLE_API_KEY) {
      throw new ProviderError('not_configured', 'Jooble API key is not set for this market.');
    }

    const page = Math.max(1, criteria.page ?? 1);
    const pageSize = clampPageSize(criteria.pageSize, 50, config.JOB_PROVIDER_MAX_RESULTS);

    // Documented POST search body.
    const body: Record<string, string> = { page: String(page) };
    if (criteria.query) body.keywords = criteria.query;
    if (criteria.location) body.location = criteria.location;
    if (criteria.employmentType) body.type = criteria.employmentType;

    const url = `https://jooble.org/api/${config.JOOBLE_API_KEY}`;
    const payload = (await fetchJsonWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
      config.JOB_PROVIDER_TIMEOUT_MS,
    )) as { jobs?: JoobleRawJob[] } | JoobleRawJob[];

    const rawJobs = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { jobs?: JoobleRawJob[] })?.jobs)
        ? (payload as { jobs: JoobleRawJob[] }).jobs
        : [];

    const jobs = rawJobs
      .map((raw) => this.normalizeJob(raw))
      .filter((job) => job.title.length > 0 && job.companyName.length > 0 && job.sourceJobId.length > 0);

    return { jobs, total: jobs.length, page, pageSize, totalPages: 1 };
  }
}

export const joobleJobSource = new JoobleJobSource();