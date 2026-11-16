/**
 * Muse public API discovery source.
 * Official public endpoint (no key): https://www.themuse.com/api/public/jobs
 * Supports `page` pagination and returns a reliable `total`. We never treat the
 * reported total as the number of results fetched; `fetchedCount` reflects what
 * we actually received.
 */

import type { DiscoveredJob, DiscoverySearchInput, DiscoverySource, SourceQueryResult } from '../types.js';
import type { HttpJsonClient } from '../http.js';
import { reliablePostedDate, parseDate, classifyFreshness } from '../freshness.js';
import { resolveGeo } from '../geo.js';

export interface MuseDeps {
  http: HttpJsonClient;
  maxPages: number;
}

export class MuseSource implements DiscoverySource {
  readonly sourceName = 'muse';
  readonly sourceProvider = 'muse';

  constructor(private readonly deps: MuseDeps) {}

  get displayName(): string {
    return 'The Muse (public API)';
  }

  isConfigured(): boolean {
    return true;
  }

  async search(_input: DiscoverySearchInput, queries: string[]): Promise<SourceQueryResult> {
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

    const jobs: DiscoveredJob[] = [];
    let upstreamTotal: number | undefined;
    const pages = Math.max(1, this.deps.maxPages);
    for (let page = 1; page <= pages; page++) {
      const res = await this.deps.http.getJson<Record<string, unknown>>(
        `https://www.themuse.com/api/public/jobs?page=${page}&category=Engineering`,
      );
      if (!res.ok) {
        if (page === 1) return { ...base, ...mapMuseError(res) };
        break; // keep whatever we already got from earlier pages
      }
      const body = res.data as {
        results?: Array<Record<string, any>>;
        total?: number;
      };
      if (typeof body.total === 'number') upstreamTotal = body.total;
      base.pagesFetched += 1;
      const results = Array.isArray(body.results) ? body.results : [];
      for (const r of results) {
        jobs.push(this.normalize(r, queries, fetchedAt));
      }
      if (results.length === 0) break;
    }

    base.jobs = jobs;
    base.fetchedCount = jobs.length;
    base.upstreamTotal = upstreamTotal;
    return base;
  }

  private normalize(r: Record<string, any>, queries: string[], fetchedAt: Date): DiscoveredJob {
    const locations: string[] = Array.isArray(r.locations) ? r.locations.map((l: any) => l?.name).filter(Boolean) : [];
    const locationText = locations.join(', ');
    const geo = resolveGeo({ locationText });
    const postedAt = reliablePostedDate(r.publication_date);
    const landing = r.refs?.landing_page ? String(r.refs.landing_page) : '';
    return {
      dedupeKey: `muse:${r.id}`,
      externalId: String(r.id),
      canonicalUrl: landing,
      applicationUrl: landing || undefined,
      title: String(r.name ?? ''),
      companyName: String(r.company?.name ?? ''),
      location: locationText || undefined,
      country: geo.country,
      countryIso: geo.countryIso,
      remoteType: geo.remoteType,
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: geo.remoteEligibleCountries,
      indiaEligible: geo.indiaEligible,
      employmentType: undefined,
      description: typeof r.contents === 'string' ? stripHtml(r.contents).slice(0, 2000) : undefined,
      sourceName: this.sourceName,
      sourceProvider: this.sourceProvider,
      sourceDisplayName: this.displayName,
      discoveredViaQuery: queries[0] ?? '',
      postedAt,
      updatedAt: parseDate(r.publication_date),
      fetchedAt,
      ...classifyFreshness(postedAt),
    };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mapMuseError(res: { cooledDown?: boolean; rateLimited?: boolean; blocked?: boolean; status?: number; error?: string }): Partial<SourceQueryResult> {
  if (res.cooledDown) return { state: 'rate_limited', error: `Muse cooling down: ${res.error ?? ''}` };
  if (res.rateLimited) return { state: 'rate_limited', error: 'Muse rate limited' };
  if (res.blocked) return { state: 'blocked_upstream', error: 'Muse blocked upstream' };
  return { state: 'temporarily_unavailable', error: `Muse: ${res.error ?? 'request failed'}` };
}
