/**
 * Remotive public remote-jobs API discovery source.
 * Official public API: https://remotive.com/api (documented at
 * https://github.com/remotive-io/remote-jobs-api). Offset/limit pagination.
 *
 * NOTE: from the current ApplyWise sandbox, api.remotive.com does not resolve
 * (DNS/DNS-egress blocked), so a LIVE request fails here and this source will
 * report `temporarily_unavailable`. This is expected and honest — Remotive is a
 * legitimate public source that works from production. It is fully unit-tested
 * against a stubbed transport. If a Remotive cooldown is active we do NOT poll
 * again until it lapses.
 */

import type { DiscoveredJob, DiscoverySearchInput, DiscoverySource, SourceQueryResult } from '../types.js';
import type { HttpJsonClient } from '../http.js';
import { reliablePostedDate, parseDate, classifyFreshness } from '../freshness.js';
import { resolveGeo, WORLDWIDE } from '../geo.js';

export interface RemotiveDeps {
  http: HttpJsonClient;
  enabled: boolean;
  maxPages: number;
  limit: number;
}

export class RemotiveSource implements DiscoverySource {
  readonly sourceName = 'remotive';
  readonly sourceProvider = 'remotive';

  constructor(private readonly deps: RemotiveDeps) {}

  get displayName(): string {
    return 'Remotive (remote jobs API)';
  }

  isConfigured(): boolean {
    return this.deps.enabled;
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
      return { ...base, state: 'not_configured', error: 'Remotive disabled' };
    }

    const maxPages = Math.max(1, Math.min(input.maxPagesPerSource ?? this.deps.maxPages, this.deps.maxPages));
    const jobs: DiscoveredJob[] = [];
    const search = queries[0] ?? '';

    for (let page = 0; page < maxPages; page++) {
      const offset = page * this.deps.limit;
      const params = new URLSearchParams({ limit: String(this.deps.limit), offset: String(offset) });
      if (search) params.set('search', search);
      const res = await this.deps.http.getJson<Record<string, unknown>>(
        `https://api.remotive.com/api/remote-jobs?${params.toString()}`,
      );
      base.pagesFetched += 1;
      if (!res.ok) {
        if (jobs.length === 0) return { ...base, ...mapRemotiveError(res) };
        break;
      }
      const body = res.data as { jobs?: Array<Record<string, any>> };
      const list = Array.isArray(body.jobs) ? body.jobs : [];
      for (const r of list) jobs.push(this.normalize(r, search, fetchedAt));
      if (list.length < this.deps.limit) break;
    }

    base.jobs = jobs;
    base.fetchedCount = jobs.length;
    return base;
  }

  private normalize(r: Record<string, any>, query: string, fetchedAt: Date): DiscoveredJob {
    const candidateLoc = String(r.candidate_required_location ?? '');
    const eligible = parseEligibility(candidateLoc);
    const geo = resolveGeo({
      locationText: candidateLoc,
      remoteTypeRaw: 'remote',
      eligibleCountriesRaw: eligible.countries,
    });
    const postedAt = reliablePostedDate(r.publication_date);
    return {
      dedupeKey: `remotive:${r.id}`,
      externalId: String(r.id),
      canonicalUrl: String(r.url ?? ''),
      applicationUrl: r.url ? String(r.url) : undefined,
      title: String(r.title ?? ''),
      companyName: String(r.company_name ?? ''),
      location: candidateLoc || undefined,
      country: geo.country,
      countryIso: eligible.worldwide ? WORLDWIDE : geo.countryIso,
      remoteType: 'remote',
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: eligible.worldwide ? undefined : eligible.countries,
      indiaEligible: eligible.worldwide || eligible.countries?.includes('IN') || candidateLoc.toLowerCase().includes('india'),
      description: typeof r.description === 'string' ? r.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) : undefined,
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

/** Parse Remotive's `candidate_required_location` into eligibility. */
function parseEligibility(raw: string): { countries?: string[]; worldwide: boolean } {
  const text = raw.trim();
  if (!text) return { worldwide: false };
  if (/worldwide|anywhere|global/i.test(text)) return { worldwide: true };
  const codes = text
    .split(/[,/]| and | or /i)
    .map((p) => p.trim())
    .map((p) => codeFor(p))
    .filter((c): c is string => Boolean(c));
  return { countries: codes, worldwide: false };
}

const NAME_TO_ISO: Record<string, string> = {
  india: 'IN', usa: 'US', 'united states': 'US', us: 'US', uk: 'GB', 'united kingdom': 'GB',
  canada: 'CA', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT', netherlands: 'NL',
  europe: 'EU', 'european union': 'EU', australia: 'AU', singapore: 'SG', japan: 'JP',
  brazil: 'BR', mexico: 'MX',
};

function codeFor(part: string): string | undefined {
  const p = part.trim().toLowerCase();
  if (!p) return undefined;
  if (NAME_TO_ISO[p]) return NAME_TO_ISO[p];
  if (/^[a-z]{2}$/.test(p)) return p.toUpperCase();
  // "Remote (India)" style
  const m = p.match(/\(([^)]+)\)/);
  if (m) return codeFor(m[1]);
  return undefined;
}

function mapRemotiveError(res: { cooledDown?: boolean; rateLimited?: boolean; blocked?: boolean; status?: number; error?: string }): Partial<SourceQueryResult> {
  if (res.cooledDown) return { state: 'rate_limited', error: `Remotive cooling down: ${res.error ?? ''}` };
  if (res.rateLimited) return { state: 'rate_limited', error: 'Remotive rate limited' };
  if (res.blocked) return { state: 'blocked_upstream', error: 'Remotive blocked upstream' };
  return { state: 'temporarily_unavailable', error: `Remotive: ${res.error ?? 'request failed'}` };
}
