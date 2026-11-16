// Live discovery check (Phase 9). Runs the real discovery pipeline against
// official public sources and prints honest per-source + freshness numbers.
// Not part of the test suite; run manually: node backend/scripts/live-discovery-check.mjs
import { HttpJsonClient, JobDiscoveryService, buildDiscoverySources, DEFAULT_COMPANY_BOARDS, AdzunaSource } from '../dist/jobs/discovery/index.js'

const http = new HttpJsonClient({ concurrency: 6, timeoutMs: 15000, cacheTtlMs: 60000 })
const sources = [
  ...buildDiscoverySources({
    http,
    companyBoards: DEFAULT_COMPANY_BOARDS,
    remotiveEnabled: true,
    maxPagesPerSource: 2,
    maxResultsPerSource: 50,
    pageSize: 20,
  }),
  // Include Adzuna so the report honestly shows it as not_configured (no keys).
  new AdzunaSource({ http, credentials: undefined, maxPages: 2, resultsPerPage: 20 }),
]
const svc = new JobDiscoveryService(sources, { maxQueries: 6, relevanceThreshold: 0.2, pageSize: 20, maxOutputPerSource: 50, resultCacheTtlMs: 0 })

const searches = [
  { label: 'React Developer — India', input: { roles: ['React Developer'], location: 'India', countryIso: 'IN', includeRemote: true, includeWorldwideRemote: true, freshness: 'any', sort: 'relevance', pageSize: 20 } },
  { label: 'Frontend Developer — Noida', input: { roles: ['Frontend Developer'], location: 'Noida', countryIso: 'IN', includeRemote: true, includeWorldwideRemote: true, freshness: 'any', sort: 'relevance', pageSize: 20 } },
  { label: 'Software Engineer — India', input: { roles: ['Software Engineer'], location: 'India', countryIso: 'IN', includeRemote: true, includeWorldwideRemote: true, freshness: 'any', sort: 'relevance', pageSize: 20 } },
  { label: 'Remote React Developer — India eligible', input: { roles: ['React Developer'], location: 'India', countryIso: 'IN', includeRemote: true, includeWorldwideRemote: true, freshness: 'any', sort: 'relevance', pageSize: 20 } },
]

function summarize(search, res) {
  const byState = {}
  for (const s of res.sources) {
    byState[s.state] = (byState[s.state] ?? 0) + 1
    }
  console.log(`\n=== ${search.label} ===`)
  console.log(`queries: ${res.queries.join(' | ')}`)
  console.log(`unique listings: ${res.totalUnique} | within7: ${res.within7Count} | older(>30d): ${res.olderCount} | undated: ${res.undatedCount}`)
  console.log(`excluded: dups=${res.excluded.duplicates} relevance=${res.excluded.relevance} geo=${res.excluded.geo} freshness=${res.excluded.freshness}`)
  console.log('sources:')
  for (const s of res.sources) {
    console.log(`  - ${s.sourceDisplayName} [${s.state}] fetched=${s.fetchedCount} pages=${s.pagesFetched}${s.error ? ` error="${s.error}"` : ''}`)
  }
  console.log('sample listings:')
  for (const j of res.jobs.slice(0, 6)) {
    const posted = j.postedAt ? new Date(j.postedAt).toISOString().slice(0, 10) : 'undated'
    console.log(`  • ${j.title} @ ${j.companyName}${j.location ? ' — ' + j.location : ''} | ${j.sourceDisplayName} | posted ${posted}${j.indiaEligible ? ' | India-eligible' : ''}`)
  }
}

for (const search of searches) {
  try {
    const res = await svc.discover(search.input)
    summarize(search, res)
  } catch (err) {
    console.log(`\n=== ${search.label} ===\nFAILED: ${err instanceof Error ? err.message : String(err)}`)
  }
}
