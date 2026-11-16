/**
 * Adzuna job-search provider.
 *
 * Endpoint shape verified against the live API: country-scoped path
 *   GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
 * with `app_id`, `app_key`, `results_per_page`, and the documented
 * `what` / `where` / `sort_by` parameters. An unauthenticated call returns HTTP
 * 401 with `{"exception":"AUTH_FAIL"}`, which is how the shared fetch helper
 * detects missing/invalid credentials and reports the source as
 * "not configured" rather than fabricating results.
 *
 * Credentials are read from server-side environment variables only and are
 * never sent to the browser.
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
  mapWithConcurrency,
  sanitizeHttpUrl,
  stripHtml,
  toDate,
  toNumber,
} from './providerUtils.js';
import { sanitizeSourceDate } from './jobFreshness.js';

// ISO 3166-1 alpha-2 lowercased. Adzuna expects exactly 2 lowercase letters in the path segment.
function sanitizeCountry(raw: string | undefined): string {
  const c = (raw ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return /^[a-z]{2}$/.test(c) ? c : 'in';
}

/** Adzuna allows results_per_page of 1..50. */
function clampPerPage(n: number): number {
  if (!Number.isFinite(n)) return 20;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

interface AdzunaRawJob {
  id?: unknown;
  title?: unknown;
  company?: { display_name?: unknown };
  location?: { display_name?: unknown; area?: unknown[]; country?: unknown };
  description?: unknown;
  redirect_url?: unknown;
  created?: unknown;
  category?: { label?: unknown };
  // Only present on some records.
  salary_min?: unknown;
  salary_max?: unknown;
  salary_is_predicted?: unknown;
  /** Verified live: employment type arrives in `contract_time`, not `contract_type`. */
  contract_type?: unknown;
  contract_time?: unknown;
  remote_ok?: unknown;
}

/**
 * Verified live response envelope for the JSON API.
 *
 * The successful shape is `{ count, results: [...] }` — the records live under
 * `results`, NOT under `list`. (`list` is the XML envelope's field name.)
 */
interface AdzunaResponse {
  results?: AdzunaRawJob[];
  count?: unknown;
  page?: unknown;
  total_pages?: unknown;
}

/**
 * Currency returned by each Adzuna country feed (verified against the live
 * `in` feed, which returns INR). Used only to label a salary the feed supplied.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
  in: 'INR',
  gb: 'GBP',
  us: 'USD',
  ca: 'CAD',
  au: 'AUD',
  de: 'EUR',
  fr: 'EUR',
  nl: 'EUR',
  br: 'BRL',
  pl: 'PLN',
  za: 'ZAR',
};

export class AdzunaJobSource extends BaseJobSourceAdapter {
  readonly sourceName = 'adzuna';
  readonly displayName = 'Adzuna';
  readonly requiresAuth = true;

  /** Lets the discovery layer distinguish "off" from "missing credentials". */
  get isDisabled(): boolean {
    return !getConfig().ADZUNA_ENABLED;
  }

  async validateConfiguration(): Promise<boolean> {
    const config = getConfig();
    return Boolean(config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY && config.ADZUNA_ENABLED);
  }

  /** Adzuna does not offer a documented single-job endpoint. */
  async getJob(): Promise<NormalizedJob | null> {
    throw new ProviderError('unsupported', 'Adzuna does not provide a single-job lookup.');
  }

  normalizeJob(rawJob: unknown, country = 'gb'): NormalizedJob {
    const raw = rawJob as AdzunaRawJob;
    const externalId = raw?.id !== undefined && raw?.id !== null ? String(raw.id) : '';
    const description = stripHtml(raw?.description);

    // Verified live: the country feed returns salaries in that country's own
    // currency (the `in` feed returns INR), not a single global currency.
    const salaryCurrency = COUNTRY_CURRENCY[country] ?? 'GBP';
    const salaryMin = toNumber(raw?.salary_min);
    const salaryMax = toNumber(raw?.salary_max);
    // Only trust a salary band when the feed marks it as real (not predicted).
    const predicted = String(raw?.salary_is_predicted ?? '') === '1';

    return {
      title: typeof raw?.title === 'string' ? raw.title.trim() : '',
      companyName:
        typeof raw?.company?.display_name === 'string' ? raw.company.display_name.trim() : '',
      location: typeof raw?.location?.display_name === 'string' ? raw.location.display_name : undefined,
      country: typeof raw?.location?.country === 'string' ? raw.location.country : undefined,
      remoteType: this.normalizeRemoteType(raw?.remote_ok === true ? 'remote' : ''),
      // Verified live: `contract_time` carries the employment type.
      employmentType: this.normalizeEmploymentType(
        typeof raw?.contract_time === 'string' ? raw.contract_time : '',
      ),
      // Adzuna does not publish a seniority level; leave unknown rather than guess.
      experienceLevel: 'unknown',
      description,
      requiredSkills: [],
      preferredSkills: [],
      // Predicted bands are guesses, so they are treated as unknown rather
      // than presented to the candidate as a real salary.
      ...(salaryMin !== undefined && !predicted ? { salaryMin } : {}),
      ...(salaryMax !== undefined && !predicted ? { salaryMax } : {}),
      salaryCurrency,
      salaryPeriod: this.normalizeSalaryPeriod('yearly'),
      applicationUrl: sanitizeHttpUrl(raw?.redirect_url),
      sourceName: this.sourceName,
      sourceJobId: externalId,
      sourceUrl: sanitizeHttpUrl(raw?.redirect_url),
      // `created` is the publication date. It is parsed defensively: a missing,
      // malformed, or future value becomes undefined (labelled "Posting date
      // unavailable") rather than being back-filled with the fetch time.
      postedAt: sanitizeSourceDate(raw?.created) ?? toDate(raw?.created),
      // Adzuna does not publish a separate update timestamp, so none is claimed.
      eligibleCountries: raw?.location?.country
        ? [String((raw.location as { country: unknown }).country).toUpperCase()]
        : undefined,
    };
  }

  /**
   * Build the upstream URL for one page.
   *
   * NOTE: do NOT send `content_type`. Verified live: supplying it (with any
   * value, including `application/json`) makes the endpoint return HTTP 400
   * with an HTML error page. The feed already defaults to JSON when an
   * `Accept: application/json` header is sent, which is what we rely on here.
   *
   * `page` is Adzuna's documented path segment (`/search/{page}`), not a query
   * parameter — that is the only supported pagination mechanism on this feed.
   */
  private buildUrl(page: number, criteria: JobSearchCriteria, resultsPerPage: number): string {
    const config = getConfig();
    const country = sanitizeCountry(config.ADZUNA_COUNTRY);
    const perPage = clampPerPage(resultsPerPage);
    const params = new URLSearchParams({
      app_id: config.ADZUNA_APP_ID as string,
      app_key: config.ADZUNA_APP_KEY as string,
      results_per_page: String(perPage),
    });

    // Adzuna's documented free-text parameters.
    if (criteria.query) params.set('what', criteria.query);
    if (criteria.location) params.set('where', criteria.location);
    if (criteria.salaryMin !== undefined) params.set('salary_min', String(criteria.salaryMin));
    if (criteria.salaryMax !== undefined) params.set('salary_max', String(criteria.salaryMax));
    if (criteria.remoteType === 'remote') params.set('remote_only', '1');

    // Documented sort orders. Preferring fresh listings uses the provider's own
    // ordering rather than a client-side guess, so page 1 is genuinely the
    // newest matches instead of an arbitrary slice.
    if (criteria.sortOrder === 'asc' || criteria.sortOrder === 'desc') {
      params.set('sort_by', criteria.sortOrder);
    } else if (criteria.preferFresh) {
      params.set('sort_by', 'date');
    }

    return `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params.toString()}`;
  }

  /** Fetch and normalize a single upstream page. */
  private async fetchPage(
    criteria: JobSearchCriteria,
    page: number,
    resultsPerPage: number,
  ): Promise<{ jobs: NormalizedJob[]; total: number; totalPages: number }> {
    const config = getConfig();
    const url = this.buildUrl(page, criteria, resultsPerPage);
    const payload = (await fetchJsonWithTimeout(
      url,
      { headers: { Accept: 'application/json' } },
      config.JOB_PROVIDER_TIMEOUT_MS,
    )) as AdzunaResponse;

    // Verified live: records arrive under `results` (the JSON envelope), not
    // under `list` (the XML envelope's field name).
    const records = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray((payload as { list?: unknown })?.list)
        ? ((payload as unknown as { list: AdzunaRawJob[] }).list)
        : [];

    // Malformed individual records are skipped, not fatal to the batch.
    const jobs = records
      .map((raw) => this.normalizeJob(raw, (config.ADZUNA_COUNTRY || 'in').toLowerCase()))
      .filter((job) => job.title.length > 0 && job.companyName.length > 0 && job.sourceJobId.length > 0);

    const total = toNumber(payload?.count) ?? jobs.length;
    const totalPages = toNumber(payload?.total_pages);

    return {
      jobs,
      total,
      totalPages: totalPages ?? (resultsPerPage > 0 ? Math.ceil(total / resultsPerPage) : 1),
    };
  }

  async searchJobs(criteria: JobSearchCriteria): Promise<JobSearchResult> {
    const config = getConfig();
    if (!config.ADZUNA_ENABLED) {
      throw new ProviderError('disabled', 'Adzuna is disabled by configuration.');
    }
    if (!config.ADZUNA_APP_ID || !config.ADZUNA_APP_KEY) {
      throw new ProviderError('not_configured', 'Adzuna credentials are not set.');
    }

    const firstPage = Math.max(1, criteria.page ?? 1);
    const resultsPerPage = clampPageSize(criteria.pageSize, 50, config.JOB_PROVIDER_MAX_RESULTS);

    // Bounded multi-page read. The page count is capped by config so a large
    // upstream `count` can never translate into unbounded upstream traffic.
    const requestedPages = Math.max(1, Math.floor(criteria.pages ?? 1));
    const pages = Math.min(requestedPages, config.JOB_PROVIDER_MAX_PAGES);

    // Page 1 establishes the upstream total so we can stop early rather than
    // requesting pages that do not exist.
    const first = await this.fetchPage(criteria, firstPage, resultsPerPage);
    const upstreamTotalPages = Math.max(1, first.totalPages);
    const pagesToFetch = Math.min(pages, Math.max(0, upstreamTotalPages - (firstPage - 1)));

    if (pagesToFetch <= 1) {
      return {
        jobs: first.jobs,
        total: first.total,
        page: firstPage,
        pageSize: resultsPerPage,
        totalPages: upstreamTotalPages,
      };
    }

    // Remaining pages run with bounded concurrency so a wide search does not
    // open an unbounded number of sockets against the provider.
    const remaining = Array.from({ length: pagesToFetch - 1 }, (_, i) => firstPage + i + 1);
    const extra = await mapWithConcurrency(remaining, config.JOB_PROVIDER_PAGE_CONCURRENCY, async (page) => {
      try {
        return await this.fetchPage(criteria, page, resultsPerPage);
      } catch (error) {
        // One unreadable page must not discard the pages that did succeed.
        if (error instanceof ProviderError && (error.code === 'rate_limited' || error.code === 'timeout')) {
          throw error;
        }
        return { jobs: [] as NormalizedJob[], total: first.total, totalPages: first.totalPages };
      }
    });

    const seen = new Set(first.jobs.map((j) => j.sourceJobId));
    const merged = [...first.jobs];
    for (const chunk of extra) {
      for (const job of chunk.jobs) {
        // Deduplicate by stable external id across pages: feeds can shift
        // records between pages while a multi-page read is in flight.
        if (seen.has(job.sourceJobId)) continue;
        seen.add(job.sourceJobId);
        merged.push(job);
      }
    }

    return {
      jobs: merged,
      total: first.total,
      page: firstPage,
      pageSize: resultsPerPage,
      totalPages: upstreamTotalPages,
    };
  }
}

export const adzunaJobSource = new AdzunaJobSource();