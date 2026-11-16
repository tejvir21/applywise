/**
 * Adzuna Jobs API discovery source (the India-focused aggregator).
 *
 * Official, documented API: https://developer.adzuna.com/
 * Requires an app_id + app_key (free tier available). We ADD these to every
 * request as query parameters and paginate via the page number in the path.
 *
 * Because it needs credentials we don't hard-code, this source is NOT live-
 * verified without keys: its state is `not_configured` until ADZUNA_APP_ID and
 * ADZUNA_APP_KEY are set. It is still fully unit-tested against a stubbed
 * transport so pagination + normalization + error mapping are covered.
 */

import type { DiscoveredJob, DiscoverySearchInput, DiscoverySource, SourceQueryResult } from '../types.js';
import type { HttpJsonClient } from '../http.js';
import { reliablePostedDate, parseDate, classifyFreshness } from '../freshness.js';
import { resolveGeo } from '../geo.js';

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
  country: string; // ISO 3166-1 alpha-2 lowercase, e.g. "in"
}

export interface AdzunaDeps {
  http: HttpJsonClient;
  credentials?: AdzunaCredentials;
  maxPages: number;
  resultsPerPage: number;
}

export class AdzunaSource implements DiscoverySource {
  readonly sourceName = 'adzuna';
  readonly sourceProvider = 'adzuna';

  constructor(private readonly deps: AdzunaDeps) {}

  get displayName(): string {
    return 'Adzuna';
  }

  isConfigured(): boolean {
    return Boolean(this.deps.credentials?.appId && this.deps.credentials?.appKey);
  }

  async search(input: DiscoverySearchInput, queries: string[]): Promise<SourceQueryResult> {
    const fetchedAt = new Date();
    const base: SourceQueryResult = {
      sourceName: this.sourceName,
      sourceProvider: this.sourceProvider,
      sourceDisplayName: this.displayName,
      state: 'connected_with_results',
      jobs: [],
      fetchedCount: 0,
      pagesFetched: 0,
      fetchedAt,
    };

    if (!this.isConfigured()) {
      return { ...base, state: 'not_configured', error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set' };
    }

    const creds = this.deps.credentials!;
    const country = sanitizeCountry(creds.country);
    const resultsPerPage = clampPerPage(this.deps.resultsPerPage);
    const maxPages = Math.max(1, Math.min(input.maxPagesPerSource ?? this.deps.maxPages, this.deps.maxPages));
    const where = input.location && input.location.toLowerCase() !== 'india' ? input.location : undefined;

    const jobs: DiscoveredJob[] = [];
    let upstreamTotal: number | undefined;
    let stopped = false;

    for (const query of queries) {
      for (let page = 1; page <= maxPages; page++) {
        const url = buildAdzunaUrl(
          `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
          {
            app_id: creds.appId,
            app_key: creds.appKey,
            results_per_page: String(resultsPerPage),
            what: query,
            ...(where ? { where } : {}),
          },
        );
        const res = await this.deps.http.getJson<Record<string, unknown>>(url);
        base.pagesFetched += 1;
        if (!res.ok) {
          if (jobs.length === 0) return { ...base, ...mapAdzunaError(res) };
          stopped = true;
          break;
        }
        const body = res.data as { count?: number; results?: Array<Record<string, any>> };
        if (typeof body.count === 'number') upstreamTotal = body.count;
        const results = Array.isArray(body.results) ? body.results : [];
        for (const r of results) jobs.push(this.normalize(r, query, fetchedAt));
        if (results.length < resultsPerPage) break; // last page
      }
      if (stopped) break;
    }

    base.jobs = jobs;
    base.fetchedCount = jobs.length;
    base.upstreamTotal = upstreamTotal;
    return base;
  }

  private normalize(r: Record<string, any>, query: string, fetchedAt: Date): DiscoveredJob {
    const locationText: string | undefined = r.location?.display_name;
    const geo = resolveGeo({ locationText, countryRaw: r.location?.area?.[0] });
    const postedAt = reliablePostedDate(r.created);
    const redirect = r.redirect_url ? String(r.redirect_url) : '';
    return {
      dedupeKey: `adzuna:${r.id}`,
      externalId: String(r.id),
      canonicalUrl: redirect,
      applicationUrl: redirect || undefined,
      title: String(r.title ?? ''),
      companyName: String(r.company?.display_name ?? ''),
      location: locationText,
      country: geo.country,
      countryIso: geo.countryIso,
      remoteType: geo.remoteType,
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: geo.remoteEligibleCountries,
      indiaEligible: geo.indiaEligible || geo.countryIso === 'IN',
      description: typeof r.description === 'string' ? r.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : undefined,
      employmentType: mapEmployment(r.contract_time, r.contract_type),
      sourceName: this.sourceName,
      sourceProvider: this.sourceProvider,
      sourceDisplayName: this.displayName,
      discoveredViaQuery: query,
      postedAt,
      updatedAt: parseDate(r.updated),
      fetchedAt,
      ...classifyFreshness(postedAt),
    };
  }
}

function buildAdzunaUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return u.toString();
}

/** Adzuna expects an ISO 3166-1 alpha-2 lowercase country in the path. */
function sanitizeCountry(raw: string | undefined): string {
  const c = (raw ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
  return /^[a-z]{2}$/.test(c) ? c : 'in';
}

/** Adzuna allows results_per_page of 1..50. */
function clampPerPage(n: number): number {
  if (!Number.isFinite(n)) return 20;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

function mapEmployment(contractTime?: string, contractType?: string): string | undefined {
  const t = `${contractTime ?? ''} ${contractType ?? ''}`.toLowerCase();
  if (t.includes('permanent')) return 'full_time';
  if (t.includes('contract')) return 'contract';
  if (t.includes('part')) return 'part_time';
  if (t.includes('intern')) return 'internship';
  return undefined;
}

function mapAdzunaError(res: {
  cooledDown?: boolean;
  rateLimited?: boolean;
  blocked?: boolean;
  status?: number;
  error?: string;
  responseSnippet?: string;
}): Partial<SourceQueryResult> {
  if (res.cooledDown) return { state: 'rate_limited', error: `Adzuna cooling down: ${res.error ?? ''}` };
  if (res.rateLimited) return { state: 'rate_limited', error: 'Adzuna rate limited' };
  if (res.blocked) return { state: 'blocked_upstream', error: 'Adzuna blocked upstream' };
  if (res.status === 401 || res.status === 403) return { state: 'not_configured', error: 'Adzuna rejected credentials' };
  if (res.status && res.status >= 400 && res.status < 500) {
    // Bad request we constructed (malformed path/param): surface the provider's
    // message for diagnosis. The snippet is the RESPONSE body only (no keys).
    const detail = res.responseSnippet ? `: ${res.responseSnippet}` : '';
    return { state: 'temporarily_unavailable', error: `Adzuna rejected request (HTTP ${res.status})${detail}` };
  }
  return { state: 'temporarily_unavailable', error: `Adzuna: ${res.error ?? 'request failed'}` };
}
