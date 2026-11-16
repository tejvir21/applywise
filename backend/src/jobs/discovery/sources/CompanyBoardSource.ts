/**
 * First-party company-board discovery sources.
 *
 * Each enabled board becomes its own DiscoverySource so its state (results /
 * no-matches / not-configured / rate-limited / unavailable / blocked) and its
 * upstream cooldown are independent. Normalization preserves the direct
 * employer application URL and attributes the employer as the source.
 *
 * Official public endpoints used:
 *  - Greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs
 *  - Lever:      GET https://api.lever.co/v0/postings/{token}?mode=json
 *  - Ashby:      GET https://api.ashbyhq.com/posting-api/job-board/{token}
 */

import type { DiscoveredJob, DiscoverySearchInput, DiscoverySource, SourceQueryResult } from '../types.js';
import type { CompanyBoard, CompanyBoardProvider } from '../registry.js';
import { HttpJsonClient } from '../http.js';
import { parseDate, reliablePostedDate, classifyFreshness } from '../freshness.js';
import { resolveGeo, normalizeRemoteType } from '../geo.js';
import { bestRelevance } from '../relevance.js';

export interface CompanyBoardDeps {
  http: HttpJsonClient;
  maxResultsPerBoard: number;
}

function boardEndpoint(provider: CompanyBoardProvider, token: string): string {
  switch (provider) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`;
  }
}

/** Base source for a single company board. */
type BoardFetch =
  | { state: 'ok'; data: unknown[] }
  | { state: 'error'; result: Partial<SourceQueryResult> };

abstract class CompanyBoardSource implements DiscoverySource {
  readonly sourceProvider: CompanyBoardProvider;

  constructor(
    readonly board: CompanyBoard,
    protected readonly deps: CompanyBoardDeps,
  ) {
    this.sourceProvider = board.provider;
  }

  get sourceName(): string {
    return `${this.board.provider}:${this.board.boardToken}`;
  }
  get displayName(): string {
    return `${this.board.company} (${this.board.provider})`;
  }

  isConfigured(): boolean {
    return this.board.enabled;
  }

  protected abstract fetchJobs(): Promise<BoardFetch>;
  protected abstract normalize(raw: unknown, viaQuery: string, fetchedAt: Date): DiscoveredJob;

  async search(_input: DiscoverySearchInput, queries: string[]): Promise<SourceQueryResult> {
    const fetchedAt = new Date();
    const base: SourceQueryResult = {
      sourceName: this.sourceName,
      sourceProvider: this.sourceProvider,
      sourceDisplayName: this.displayName,
      state: 'connected_with_results',
      jobs: [],
      fetchedCount: 0,
      pagesFetched: 1,
      fetchedAt,
    };

    if (!this.isConfigured()) {
      return { ...base, state: 'not_configured', error: 'Board disabled' };
    }

    const res = await this.fetchJobs();
    if (res.state !== 'ok') {
      return { ...base, ...res.result };
    }

    const rawJobs = res.data;
    base.fetchedCount = rawJobs.length;
    const normalized: DiscoveredJob[] = [];
    for (const raw of rawJobs) {
      try {
        const guess = bestRelevance(
          {
            title: String((raw as { title?: string; text?: string }).title ?? (raw as { text?: string }).text ?? ''),
            companyName: this.board.company,
            description: String((raw as { content?: string; descriptionPlain?: string }).content ?? (raw as { descriptionPlain?: string }).descriptionPlain ?? ''),
          },
          queries,
        );
        normalized.push(this.normalize(raw, guess.matchedQuery, fetchedAt));
      } catch {
        // skip a malformed listing without failing the rest of the board
      }
    }
    base.jobs = normalized;
    return base;
  }
}

type FetchOk = { state: 'ok'; data: unknown[] };
type FetchErr = { state: 'error'; result: Partial<SourceQueryResult> };

function mapHttpError(prefix: string, err: string, status: number | undefined, res: {
  cooledDown?: boolean;
  rateLimited?: boolean;
  blocked?: boolean;
}): FetchErr {
  if (res.cooledDown) {
    return { state: 'error', result: { state: 'rate_limited', error: `${prefix} cooling down: ${err}`, cooldownUntil: undefined } };
  }
  if (res.rateLimited) {
    return { state: 'error', result: { state: 'rate_limited', error: `${prefix} rate limited` } };
  }
  if (res.blocked) {
    return { state: 'error', result: { state: 'blocked_upstream', error: `${prefix} blocked upstream` } };
  }
  if (status === 404 || status === 400) {
    // Invalid or inaccessible board identifier -> treat as not configured.
    return { state: 'error', result: { state: 'not_configured', error: `${prefix} not found (${status}) — verify board identifier` } };
  }
  if (status === 401 || status === 403) {
    return { state: 'error', result: { state: 'blocked_upstream', error: `${prefix} unauthorized` } };
  }
  return { state: 'error', result: { state: 'temporarily_unavailable', error: `${prefix}: ${err}` } };
}

async function fetchList(
  http: HttpJsonClient,
  url: string,
  extract: (body: unknown) => unknown[],
  prefix: string,
): Promise<FetchOk | FetchErr> {
  const res = await http.getJson<unknown>(url);
  if (res.ok) {
    let list: unknown[] = [];
    try {
      list = extract(res.data);
    } catch {
      return { state: 'error', result: { state: 'temporarily_unavailable', error: `${prefix}: unexpected shape` } };
    }
    return { state: 'ok', data: list };
  }
  return mapHttpError(prefix, res.error ?? 'request failed', res.status, res);
}

// ---- Greenhouse ----
export class GreenhouseSource extends CompanyBoardSource {
  protected fetchJobs() {
    return fetchList(
      this['deps'].http,
      boardEndpoint('greenhouse', this.board.boardToken),
      (body) => {
        const j = body as { jobs?: unknown[] };
        return Array.isArray(j?.jobs) ? j.jobs : [];
      },
      `Greenhouse ${this.board.company}`,
    );
  }

  protected normalize(raw: unknown, viaQuery: string, fetchedAt: Date): DiscoveredJob {
    const j = raw as Record<string, any>;
    const locationText: string | undefined = j.location?.name;
    const geo = resolveGeo({ locationText, remoteTypeRaw: /remote/i.test(locationText ?? '') ? 'remote' : undefined });
    const postedAt = reliablePostedDate(j.first_published);
    return {
      dedupeKey: `greenhouse:${j.id}`,
      externalId: String(j.id),
      canonicalUrl: String(j.absolute_url ?? ''),
      applicationUrl: j.absolute_url ? String(j.absolute_url) : undefined,
      title: String(j.title ?? ''),
      companyName: this.board.company || String(j.company_name ?? ''),
      location: locationText,
      country: geo.country,
      countryIso: geo.countryIso,
      remoteType: geo.remoteType,
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: geo.remoteEligibleCountries,
      indiaEligible: geo.indiaEligible,
      description: undefined,
      sourceName: this.sourceName,
      sourceProvider: 'greenhouse',
      sourceDisplayName: this.displayName,
      discoveredViaQuery: viaQuery,
      postedAt,
      updatedAt: parseDate(j.updated_at),
      fetchedAt,
      ...classifyFreshness(postedAt),
    };
  }
}

// ---- Lever ----
export class LeverSource extends CompanyBoardSource {
  protected fetchJobs() {
    return fetchList(
      this['deps'].http,
      boardEndpoint('lever', this.board.boardToken),
      (body) => (Array.isArray(body) ? body : []),
      `Lever ${this.board.company}`,
    );
  }

  protected normalize(raw: unknown, viaQuery: string, fetchedAt: Date): DiscoveredJob {
    const j = raw as Record<string, any>;
    const locations: string[] = Array.isArray(j.categories?.allLocations) ? j.categories.allLocations : [];
    const locationText: string = j.categories?.location ?? locations.join(', ') ?? '';
    const geo = resolveGeo({
      locationText,
      countryIsoRaw: j.country,
      remoteTypeRaw: j.workplaceType,
    });
    const postedAt = reliablePostedDate(j.createdAt);
    return {
      dedupeKey: `lever:${j.id}`,
      externalId: String(j.id),
      canonicalUrl: String(j.hostedUrl ?? j.applyUrl ?? ''),
      applicationUrl: j.applyUrl ? String(j.applyUrl) : undefined,
      title: String(j.text ?? ''),
      companyName: this.board.company,
      location: locationText,
      country: geo.country,
      countryIso: geo.countryIso,
      remoteType: geo.remoteType,
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: geo.remoteEligibleCountries,
      indiaEligible: geo.indiaEligible,
      description: typeof j.descriptionPlain === 'string' ? j.descriptionPlain : undefined,
      employmentType: mapEmployment(j.categories?.commitment),
      sourceName: this.sourceName,
      sourceProvider: 'lever',
      sourceDisplayName: this.displayName,
      discoveredViaQuery: viaQuery,
      postedAt,
      updatedAt: undefined,
      fetchedAt,
      ...classifyFreshness(postedAt),
    };
  }
}

// ---- Ashby ----
export class AshbySource extends CompanyBoardSource {
  protected fetchJobs() {
    return fetchList(
      this['deps'].http,
      boardEndpoint('ashby', this.board.boardToken),
      (body) => {
        const j = body as { jobs?: unknown[] };
        return Array.isArray(j?.jobs) ? j.jobs : [];
      },
      `Ashby ${this.board.company}`,
    );
  }

  protected normalize(raw: unknown, viaQuery: string, fetchedAt: Date): DiscoveredJob {
    const j = raw as Record<string, any>;
    const locationText: string | undefined = j.location;
    const eligibleCountries = collectAshbyCountries(j);
    const geo = resolveGeo({
      locationText,
      remoteTypeRaw: typeof j.isRemote === 'boolean' ? j.isRemote : undefined,
      eligibleCountriesRaw: eligibleCountries,
    });
    const postedAt = reliablePostedDate(j.publishedAt);
    return {
      dedupeKey: `ashby:${j.id}`,
      externalId: String(j.id),
      canonicalUrl: String(j.jobUrl ?? j.applyUrl ?? ''),
      applicationUrl: j.applyUrl ? String(j.applyUrl) : undefined,
      title: String(j.title ?? ''),
      companyName: this.board.company,
      location: locationText,
      country: geo.country,
      countryIso: geo.countryIso,
      remoteType: geo.remoteType,
      remoteEligibility: geo.remoteEligibility,
      remoteEligibleCountries: geo.remoteEligibleCountries,
      indiaEligible: geo.indiaEligible,
      description: typeof j.descriptionPlain === 'string' ? j.descriptionPlain : undefined,
      employmentType: mapEmployment(j.employmentType),
      sourceName: this.sourceName,
      sourceProvider: 'ashby',
      sourceDisplayName: this.displayName,
      discoveredViaQuery: viaQuery,
      postedAt,
      updatedAt: parseDate(j.updatedAt),
      fetchedAt,
      ...classifyFreshness(postedAt),
    };
  }
}

function collectAshbyCountries(j: Record<string, any>): string[] {
  const countries: string[] = [];
  const push = (c: unknown) => {
    if (typeof c === 'string' && c.trim()) countries.push(c.trim());
  };
  push(j.address?.postalAddress?.addressCountry);
  if (Array.isArray(j.secondaryLocations)) {
    for (const s of j.secondaryLocations) push(s?.address?.postalAddress?.addressCountry);
  }
  return countries;
}

function mapEmployment(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const v = raw.toLowerCase();
  if (v.includes('full')) return 'full_time';
  if (v.includes('part')) return 'part_time';
  if (v.includes('contract') || v.includes('temp')) return 'contract';
  if (v.includes('intern')) return 'internship';
  if (v.includes('freelance')) return 'freelance';
  return undefined;
}

/** Factory: one DiscoverySource per enabled board. */
export function createCompanyBoardSources(boards: CompanyBoard[], deps: CompanyBoardDeps): DiscoverySource[] {
  const sources: DiscoverySource[] = [];
  for (const board of boards) {
    switch (board.provider) {
      case 'greenhouse':
        sources.push(new GreenhouseSource(board, deps));
        break;
      case 'lever':
        sources.push(new LeverSource(board, deps));
        break;
      case 'ashby':
        sources.push(new AshbySource(board, deps));
        break;
    }
  }
  return sources;
}

// re-exported for tests
export { normalizeRemoteType };
