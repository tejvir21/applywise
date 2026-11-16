/**
 * Job discovery module wiring.
 *
 * Builds a single JobDiscoveryService wired with a shared, polite HTTP client
 * (bounded concurrency, timeouts, cooldowns, short-TTL caching) and all
 * configured sources: first-party company boards (Greenhouse/Lever/Ashby),
 * the Muse public API, and the key-gated Adzuna + public Remotive sources.
 *
 * Sources missing credentials report `not_configured`; sources that cannot be
 * reached from the current environment (e.g. an egress-blocked host) report
 * `temporarily_unavailable`. Neither removes results from healthy sources.
 */

import { getConfig } from '../../config/index.js';
import { HttpJsonClient } from './http.js';
import { JobDiscoveryService } from './JobDiscoveryService.js';
import { loadCompanyBoards, type CompanyBoard } from './registry.js';
import { createCompanyBoardSources } from './sources/CompanyBoardSource.js';
import { MuseSource } from './sources/MuseSource.js';
import { AdzunaSource } from './sources/AdzunaSource.js';
import { RemotiveSource } from './sources/RemotiveSource.js';
import type { DiscoverySource } from './types.js';

export * from './types.js';
export { HttpJsonClient } from './http.js';
export { JobDiscoveryService } from './JobDiscoveryService.js';
export { loadCompanyBoards, parseCompanyBoards, DEFAULT_COMPANY_BOARDS } from './registry.js';
export type { CompanyBoard } from './registry.js';
export { createCompanyBoardSources } from './sources/CompanyBoardSource.js';
export { MuseSource } from './sources/MuseSource.js';
export { AdzunaSource } from './sources/AdzunaSource.js';
export { RemotiveSource } from './sources/RemotiveSource.js';

/** Construct discovery sources from explicit inputs (tests inject stubs). */
export function buildDiscoverySources(deps: {
  http: HttpJsonClient;
  companyBoards: CompanyBoard[];
  adzunaCredentials?: { appId: string; appKey: string; country: string };
  remotiveEnabled: boolean;
  maxPagesPerSource: number;
  maxResultsPerSource: number;
  pageSize: number;
}): DiscoverySource[] {
  const sources: DiscoverySource[] = [];
  sources.push(
    ...createCompanyBoardSources(deps.companyBoards, {
      http: deps.http,
      maxResultsPerBoard: deps.maxResultsPerSource,
    }),
  );
  sources.push(new MuseSource({ http: deps.http, maxPages: Math.min(deps.maxPagesPerSource, 3) }));
  if (deps.adzunaCredentials) {
    sources.push(
      new AdzunaSource({
        http: deps.http,
        credentials: deps.adzunaCredentials,
        maxPages: deps.maxPagesPerSource,
        resultsPerPage: deps.pageSize,
      }),
    );
  }
  sources.push(
    new RemotiveSource({
      http: deps.http,
      enabled: deps.remotiveEnabled,
      maxPages: deps.maxPagesPerSource,
      limit: deps.pageSize,
    }),
  );
  return sources;
}

/** Build the production-wired service from environment config. */
export function createDiscoveryService(): JobDiscoveryService {
  const config = getConfig();
  const http = new HttpJsonClient({
    concurrency: config.DISCOVERY_HTTP_CONCURRENCY,
    timeoutMs: config.DISCOVERY_HTTP_TIMEOUT_MS,
    cacheTtlMs: config.DISCOVERY_HTTP_CACHE_TTL_MS,
  });
  const boards = loadCompanyBoards(config.COMPANY_BOARDS_JSON);
  const adzunaCredentials =
    config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY
      ? { appId: config.ADZUNA_APP_ID, appKey: config.ADZUNA_APP_KEY, country: config.ADZUNA_COUNTRY }
      : undefined;
  const sources = buildDiscoverySources({
    http,
    companyBoards: boards,
    adzunaCredentials,
    remotiveEnabled: config.REMOTIVE_ENABLED === 'true',
    maxPagesPerSource: config.DISCOVERY_MAX_PAGES_PER_SOURCE,
    maxResultsPerSource: config.DISCOVERY_MAX_RESULTS_PER_SOURCE,
    pageSize: config.DISCOVERY_PAGE_SIZE,
  });
  return new JobDiscoveryService(sources, {
    maxQueries: config.DISCOVERY_MAX_QUERIES,
    relevanceThreshold: config.DISCOVERY_RELEVANCE_THRESHOLD,
    pageSize: config.DISCOVERY_PAGE_SIZE,
    maxOutputPerSource: config.DISCOVERY_MAX_RESULTS_PER_SOURCE,
    resultCacheTtlMs: config.DISCOVERY_RESULT_CACHE_MS,
  });
}

// Shared singleton for the route. Built lazily so importing this module has no
// side effects in unit tests.
let singleton: JobDiscoveryService | null = null;
export function getDiscoveryService(): JobDiscoveryService {
  if (!singleton) singleton = createDiscoveryService();
  return singleton;
}
