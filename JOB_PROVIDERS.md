# Job Providers — live discovery

This document covers **live job discovery** (`GET /api/jobs/search`, `src/jobs/discovery/*`).
Discovery is a *read* pipeline: it never writes to the database, never changes the
matching formula, and never bypasses anti-bot protections. It is separate from the
persist-on-import adapters (`POST /api/jobs/import/*`, `src/jobs/*JobSource.ts`).

Integrity rules enforced across all sources:

- **Posting date, source update date, and fetch date are kept distinct.** We never
  substitute the retrieval date for the posting date. Undated listings are labeled
  "Posting date unavailable", never fabricated and never silently dropped.
- **Remote ≠ available in India.** Remote eligibility is explicit (`remote_worldwide`,
  `remote_listed` with countries, or `unknown`); India relevance is decided per-listing
  from its real location/eligibility.
- **An accessible listing is never claimed to be "open".** We surface what a source
  publishes, with honest per-source state.
- **No invented totals.** `totalUnique` is the number actually fetched + deduplicated;
  an upstream `total`/`count`, when the source reports one, is surfaced separately as
  `upstreamTotal`.

## Sources

| Source | Type | Official endpoint | Auth | Notes |
| --- | --- | --- | --- | --- |
| Greenhouse | company board | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs` | none (public board) | Returns `company_name`, `first_published`, `updated_at`. |
| Lever | company board | `https://api.lever.co/v0/postings/{token}?mode=json` | none (public board) | Returns `country` (ISO-2), `createdAt`, `applyUrl`. |
| Ashby | company board | `https://api.ashbyhq.com/posting-api/job-board/{token}` | none (public board) | Returns `isRemote`, `publishedAt`, `jobUrl`/`applyUrl`, location/country. |
| The Muse | public job API | `https://www.themuse.com/api/public/jobs` | none | Global; `publication_date`, `refs.landing_page`, real `total`. India coverage via the unfiltered public feed is limited. |
| Adzuna | job-search API | `https://api.adzuna.com/v1/api/jobs/{country}/search/{page}` | **app_id + app_key** | India-focused aggregator. `not_configured` until keys are set. |
| Remotive | public remote API | `https://api.remotive.com/api/remote-jobs` | none | Global remote. May be blocked by network egress (reports `temporarily_unavailable`). |

Company boards (Greenhouse/Lever/Ashby) and The Muse need **no credentials**. LinkedIn,
Indeed, Naukri, Apna, and Wellfound are intentionally **not** used for discovery: none
offers an unrestricted candidate-side search/submission API, and we do not scrape pages in
violation of access controls or terms.

## Live-verified boards (built-in registry)

`src/jobs/discovery/registry.ts` ships a verified registry. Each entry was validated live
against its official endpoint (HTTP 200 with a jobs array) during implementation.

- **Indian technology companies:** `groww` (Bengaluru), `slice`, `druva` (Pune) — Greenhouse.
- **Employers that recruit in India (also useful for worldwide-remote):** `cloudflare`,
  `gitlab`, `elastic`, `databricks`, `datadog`, `twilio`, `mongodb` — Greenhouse;
  `openai`, `notion` — Ashby.

Re-verify any board at any time:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://boards-api.greenhouse.io/v1/boards/groww/jobs   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://api.lever.co/v0/postings/{token}?mode=json       # 200
curl -s -o /dev/null -w "%{http_code}\n" https://api.ashbyhq.com/posting-api/job-board/{token}     # 200
```

## Adding a company board

1. Find the company's board token from its public careers/jobs URL. The token is the slug:
   - Greenhouse: `job-boards.greenhouse.io/<TOKEN>` (or embed on their careers page)
   - Lever: `jobs.lever.co/<TOKEN>`
   - Ashby: `jobs.ashbyhq.com/<TOKEN>`
2. **Verify it before enabling** — never invent identifiers. Hit the official endpoint
   (above); a valid board returns HTTP 200 with a jobs array. A 404 means wrong
   provider/token.
3. Either add it to `DEFAULT_COMPANY_BOARDS` in `src/jobs/discovery/registry.ts`, or set
   `COMPANY_BOARDS_JSON` (overrides the built-in set — include every board you want):

```json
[
  {"company":"Groww","provider":"greenhouse","boardToken":"groww","careerUrl":"https://job-boards.greenhouse.io/groww","enabled":true}
]
```

Fields: `company`, `provider` (`greenhouse|lever|ashby`), `boardToken`, `careerUrl`
(optional; defaults to the official board URL), `enabled`. Invalid/unreachable boards
surface as `not_configured` in search results and never block other sources.

## Enabling Adzuna

1. Create a free account at <https://developer.adzuna.com/> and get an `app_id` + `app_key`.
2. Set `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (and optionally `ADZUNA_COUNTRY=in`) in the
   backend `.env`. Until then, Adzuna reports `not_configured` (no keys are hard-coded).

## Bounds, quotas, and politeness

- **Pagination is bounded**: at most `DISCOVERY_MAX_PAGES_PER_SOURCE` pages per source per
  query, `DISCOVERY_MAX_RESULTS_PER_SOURCE` retained per source, `DISCOVERY_MAX_QUERIES`
  expanded queries per search, and a global concurrency cap
  (`DISCOVERY_HTTP_CONCURRENCY`). We never request unlimited pages just because an
  upstream count is large.
- **Cooldowns**: on `429` we honor `Retry-After` and cool the host down; `403`/anti-bot
  walls map to `blocked_upstream` with a cooldown; transient/`5xx`/network failures map to
  `temporarily_unavailable` with a short cooldown. A cooling-down source is **not** re-polled
  until the window lapses.
- **Caching**: public JSON responses are cached for `DISCOVERY_HTTP_CACHE_TTL_MS` and the
  assembled result for `DISCOVERY_RESULT_CACHE_MS`, so "load more" re-issues no upstream
  calls within the TTL.
- **Costs**: company boards and The Muse are free/unauthenticated. Adzuna has a free tier
  (rate-limited) and paid tiers; Remotive is free. No paid keys are required to get real
  India-eligible results (the Greenhouse/Ashby boards already return them).

## Testing a live run

```bash
cd backend && npm run build && node scripts/live-discovery-check.mjs
```

This runs the real pipeline for "React Developer — India", "Frontend Developer — Noida",
"Software Engineer — India", and "Remote React Developer — India eligible", printing unique
counts, freshness distribution, and per-source state.
