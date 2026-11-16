/**
 * The Muse jobs provider.
 *
 * Endpoint verified live against the public API:
 *   GET https://www.themuse.com/api/public/jobs?page=N&category=...
 * Returns `{page, page_count, items_per_page, total, results[]}` where each
 * result carries `id`, `name`, `company.name`, `locations[].name`,
 * `categories[].name`, `levels[].short_name` (senior/mid/…), `publication_date`,
 * `refs.landing_page` (original listing), and HTML in `contents`.
 *
 * The public listing works without an API key. If The Muse requires a key for
 * the configured deployment, MUSE_API_KEY can be supplied and is sent as a
 * bearer token — it is a server-side secret and never reaches the browser.
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

interface MuseRawJob {
  id?: unknown;
  name?: unknown;
  company?: { name?: unknown; short_name?: unknown };
  locations?: Array<{ name?: unknown }>;
  categories?: Array<{ name?: unknown }>;
  levels?: Array<{ name?: unknown; short_name?: unknown }>;
  contents?: unknown;
  short_description?: unknown;
  refs?: { landing_page?: unknown };
  publication_date?: unknown;
  type?: unknown;
  short_name?: unknown;
}

interface MuseResponse {
  results?: MuseRawJob[];
  page?: unknown;
  page_count?: unknown;
  items_per_page?: unknown;
  total?: unknown;
}

/** The Muse uses "Senior Level"/"Mid Level"; map short names onto our enum. */
function mapMuseLevel(shortName: unknown, name: unknown): NormalizedJob['experienceLevel'] {
  const value = String(shortName ?? name ?? '').toLowerCase();
  if (value.includes('senior')) return 'senior';
  if (value.includes('lead') || value.includes('director') || value.includes('principal')) return 'lead';
  if (value.includes('mid')) return 'mid';
  if (value.includes('junior')) return 'junior';
  if (value.includes('entry') || value.includes('intern')) return 'entry';
  return 'unknown';
}

export class MuseJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'muse';
  readonly displayName = 'The Muse';
  readonly requiresAuth = false;

  /** Lets the discovery layer distinguish "off" from "missing credentials". */
  get isDisabled(): boolean {
    return !getConfig().MUSE_ENABLED;
  }

  async validateConfiguration(): Promise<boolean> {
    return getConfig().MUSE_ENABLED;
  }

  async getJob(): Promise<NormalizedJob | null> {
    throw new ProviderError('unsupported', 'The Muse does not provide a single-job lookup.');
  }

  normalizeJob(rawJob: unknown): NormalizedJob {
    const raw = rawJob as MuseRawJob;
    const externalId = raw?.id !== undefined && raw?.id !== null ? String(raw.id) : '';
    const landingPage = sanitizeHttpUrl(raw?.refs?.landing_page);
    const description = stripHtml(raw?.contents) ?? stripHtml(raw?.short_description);
    const locationName =
      Array.isArray(raw?.locations) && typeof raw.locations[0]?.name === 'string'
        ? (raw.locations[0] as { name: string }).name
        : undefined;
    const level = Array.isArray(raw?.levels) ? raw.levels[0] : undefined;

    return {
      title: typeof raw?.name === 'string' ? raw.name.trim() : '',
      companyName: typeof raw?.company?.name === 'string' ? raw.company.name.trim() : '',
      location: locationName,
      // The Muse does not classify work mode; only mark remote when the
      // location explicitly says so, otherwise leave unknown.
      remoteType: locationName && /remote/i.test(locationName) ? 'remote' : 'unknown',
      employmentType: 'unknown',
      experienceLevel: mapMuseLevel(level?.short_name, level?.name),
      description,
      requiredSkills: [],
      preferredSkills: [],
      salaryCurrency: 'USD',
      salaryPeriod: 'yearly',
      applicationUrl: landingPage,
      sourceName: this.sourceName,
      sourceJobId: externalId,
      sourceUrl: landingPage,
      postedAt: toDate(raw?.publication_date),
    };
  }

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    const config = getConfig();
    if (!config.MUSE_ENABLED) {
      throw new ProviderError('disabled', 'The Muse is disabled by configuration.');
    }

    const page = Math.max(1, criteria.page ?? 1);
    const resultsPerPage = clampPageSize(criteria.pageSize, 50, config.JOB_PROVIDER_MAX_RESULTS);

    const params = new URLSearchParams({ page: String(page) });
    if (criteria.query) params.set('category', criteria.query);
    if (criteria.location) params.set('location', criteria.location);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.MUSE_API_KEY) headers.Authorization = `Bearer ${config.MUSE_API_KEY}`;

    const url = `https://www.themuse.com/api/public/jobs?${params.toString()}`;
    const payload = (await fetchJsonWithTimeout(
      url,
      { headers },
      config.JOB_PROVIDER_TIMEOUT_MS,
    )) as MuseResponse;

    const rawResults = Array.isArray(payload?.results) ? payload.results : [];
    // The Muse returns a fixed items_per_page (20) regardless of any requested
    // size, so trim to the caller's bound to keep API requests predictable.
    const rawJobs = rawResults.slice(0, resultsPerPage);
    let jobs = rawJobs
      .map((raw) => this.normalizeJob(raw))
      .filter((job) => job.title.length > 0 && job.companyName.length > 0 && job.sourceJobId.length > 0);

    // The Muse's public API filters strictly by exact `category` and does NOT
    // apply the `location` parameter server-side (verified: two different
    // location values return identical result sets). A free-text keyword like
    // "React Developer" yields zero hits as a category, so fall back to
    // client-side matching over the returned page to keep the source usable
    // for ordinary keyword searches.
    if (jobs.length === 0 && criteria.query) {
      params.delete('category');
      params.set('page', '1');
      const fallbackUrl = `https://www.themuse.com/api/public/jobs?${params.toString()}`;
      const fallbackPayload = (await fetchJsonWithTimeout(
        fallbackUrl,
        { headers },
        config.JOB_PROVIDER_TIMEOUT_MS,
      )) as MuseResponse;

      const fallbackRaw = Array.isArray(fallbackPayload?.results)
        ? (fallbackPayload.results as MuseRawJob[]).slice(0, resultsPerPage * 3)
        : [];

      // Match on meaningful keyword tokens (dropping generic filler) so a
      // phrase like "React Developer" still matches "Senior React Developer"
      // instead of requiring an exact full-string hit.
      const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'at', 'to', 'for', 'with']);
      const tokens = criteria.query
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

      jobs = fallbackRaw
        .map((raw) => this.normalizeJob(raw))
        .filter((job) => job.title.length > 0 && job.companyName.length > 0 && job.sourceJobId.length > 0)
        .filter((job) => {
          const haystack = `${job.title} ${job.companyName} ${job.description ?? ''}`.toLowerCase();
          const phrase = criteria.query!.toLowerCase();
          if (haystack.includes(phrase)) return true;
          return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
        })
        .slice(0, resultsPerPage);
    }

    // The location filter is not honored upstream, so apply it here against
    // the listing's own location when one was supplied.
    if (criteria.location && jobs.length > 0) {
      const loc = criteria.location.toLowerCase();
      const filtered = jobs.filter(
        (job) => !job.location || job.location.toLowerCase().includes(loc) || /flexible|remote/i.test(job.location),
      );
      // Only apply when it doesn't wipe out the whole page, to avoid an empty
      // result set caused by an upstream that doesn't model the location.
      if (filtered.length > 0) jobs = filtered;
    }

    const total = typeof payload?.total === 'number' ? payload.total : jobs.length;
    const pageCount = typeof payload?.page_count === 'number' ? payload.page_count : undefined;

    return {
      jobs,
      total,
      page,
      pageSize: resultsPerPage,
      totalPages: pageCount ?? 1,
    };
  }
}

export const museJobSource = new MuseJobSource();