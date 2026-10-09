# API

Base path: `/api`

All JSON responses use one of these envelopes.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

Stack traces are never returned to clients.

## Phase 1 endpoints

### `GET /api`

API metadata and docs URL.

```json
{
  "success": true,
  "data": {
    "name": "AI Job Application Agent API",
    "version": "0.1.0",
    "docs": "/api/docs",
    "health": "/api/health"
  }
}
```

### `GET /api/health`

Liveness plus dependency status.

`data.status` is `ok` when MongoDB ping succeeds, otherwise `degraded`.

```json
{
  "success": true,
  "data": {
    "status": "degraded",
    "service": "ai-job-application-agent",
    "version": "0.1.0",
    "environment": "development",
    "mongodb": "disconnected",
    "ai_provider": "mock",
    "storage_provider": "local",
    "browser_automation_provider": "mock"
  }
}
```

### `GET /api/health/live`

Process is up. Does not ping MongoDB.

```json
{
  "success": true,
  "data": { "status": "ok" }
}
```

### `POST /api/auth/register`

Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 900
  }
}
```

**Errors:** `VALIDATION_ERROR` (422), `CONFLICT` (409), `RATE_LIMITED` (429)

### `POST /api/auth/login`

Authenticate user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 900
  }
}
```

**Errors:** `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `RATE_LIMITED` (429)

### `POST /api/auth/refresh`

Refresh access token using refresh token (rotates refresh token).

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 900
  }
}
```

**Errors:** `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `RATE_LIMITED` (429)

### `POST /api/auth/refresh`

Refresh access token. Accepts `{ "refresh_token": "..." }` in the body (legacy/mobile contract) or falls back to the HttpOnly refresh cookie (browser silent-refresh contract). Rotates the refresh token: the presented token is revoked and cannot be replayed.

### `POST /api/auth/logout`

Logout - clears the `refresh_token` HttpOnly cookie and revokes the server-side session (presented body or cookie token); client must also discard tokens. Idempotent: unknown or expired tokens still return 200 with the cookie cleared.

### `GET /api/auth/session`

Restore a session from the HttpOnly refresh cookie (no body needed). Rotates the cookie and returns `{ access_token, token_type, expires_in }` only — the refresh token never appears in the response. 401 when no valid cookie exists (signed-out state).

Sessions: short-lived access tokens (Authorization header) plus rotating refresh tokens tracked server-side (`jti` allow-list with TTL cleanup). Logout and rotation revoke sessions, so copied tokens stop working. Cookies are `HttpOnly`, `Secure` + `SameSite=None` in production (cross-site frontend/backend), `Lax` without `Secure` in development; CORS origins stay explicit, never wildcard, with credentials enabled.

### `GET /api/auth/me`

Get current authenticated user. Requires `Authorization: Bearer <access_token>`.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "created_at": "2026-01-15T10:30:00.000Z",
    "is_active": true
  }
}
```

**Errors:** `UNAUTHORIZED` (401)

## Implemented: Phases 2–4

All routes below require `Authorization: Bearer <access_token>` unless noted.

### Profile (`/api/profile`)

- `GET /api/profile` — get own candidate profile
- `POST /api/profile` — create profile
- `PUT /api/profile`, `PATCH /api/profile` — replace / partially update profile
- `DELETE /api/profile` — delete own profile
- `GET /api/profile/completion` — profile completeness
- `GET/PUT/PATCH /api/profile/preferences` — job preferences
- `POST/DELETE /api/profile/skills|experience|education|projects|certifications[/...]` — manage profile sub-collections

### Resumes (`/api/resumes`)

- `POST /api/resumes` — multipart upload, field name `file`. PDF (`.pdf`) or DOCX (`.docx`) only, up to `MAX_RESUME_SIZE_MB` (default 10 MB). Extension, declared MIME, and content magic bytes (`%PDF-`, ZIP) must agree; mismatches, empty files, and traversal filenames are rejected (422 `VALIDATION_ERROR`), oversize files with 413 `PAYLOAD_TOO_LARGE`. Files persist through the configured storage provider under server-controlled keys; metadata is written only after storage succeeds, and orphaned files are removed if the database write fails. Responds 201 with the resume plus a `pending` analysis placeholder.
- `GET /api/resumes`, `GET /api/resumes/:id` — list / fetch own resumes
- `GET /api/resumes/:id/download` — download stored file
- `DELETE /api/resumes/:id` — soft-delete own resume and remove the stored file
- `PATCH /api/resumes/:id/default` — mark default resume
- `POST /api/resumes/:id/analyze`, `GET /api/resumes/:id/analysis`, `POST /api/resumes/:id/analysis/retry` — parse the stored bytes with deterministic local parsers (pdf-parse/mammoth); unparseable content marks the analysis `failed` with a warning and returns 422 (never a crash)
- `POST /api/resumes/:id/import` — import parsed data into profile **without overwriting verified values**: only empty fields are filled; pre-existing differing values are reported in `conflicts` and preserved; skills stay additive without duplicates

Storage requirements: `STORAGE_PROVIDER=local` persists under `RESUME_STORAGE_PATH` (default `./storage/uploads`), which production deployments must back with durable storage (mounted volume). `s3`/`cloudinary` are not implemented and fail clearly instead of pretending durability.

### Jobs (`/api/jobs`, Phase 4)

- `GET /api/jobs` — list own jobs with `query/company/location/remoteType/employmentType/experienceLevel/salary*/skills/source/status/postedAfter/postedBefore/page/pageSize/sortBy/sortOrder` filters
- `POST /api/jobs/manual` — create manual entry (strict schema; 409 `DUPLICATE` on normalized company+title+location+URL match)
- `GET /api/jobs/saved` — paginated saved jobs (static route; registered before `/:id`)
- `GET /api/jobs/:id`, `GET /api/jobs/:id/status` — detail / detail with `isSaved` (malformed IDs → 404 `NOT_FOUND`)
- `PATCH /api/jobs/:id` — update own manual jobs only (externally sourced → 422; source/internal fields rejected by strict schema)
- `DELETE /api/jobs/:id` — soft-delete own manual jobs (excluded from listings)
- `POST /api/jobs/:id/save` (201 new / 200 already saved), `DELETE /api/jobs/:id/save` — save/unsave
- `POST /api/jobs/import/mock` — import deterministic mock jobs (`count` 1–50, default 10)
- `POST /api/jobs/import/source` — import via registry adapter (`mock` only today)

Deduplication: unique `normalizedKey` (sparse) for manual entries; unique partial index on `(sources.name, sources.sourceJobId)` covering only string `sourceJobId` values, so manual entries without one never collide.

### Matching (`/api/jobs`, Phase 5)

Deterministic scoring against the caller's verified profile. No AI involved. Scores are fit indicators for ranking, not interview probabilities.

- `GET /api/jobs/matches?minScore=&page=&pageSize=` — ranked matches (`matchScore` desc) with `eligible` flags; `minScore` 0–100 (422 otherwise); requires a profile (404 `NOT_FOUND` without one)
- `GET /api/jobs/:id/match` — single owned-job match with structured explanation (`score`, `eligible` + reasons, per-factor `matched`/`mismatched`, `missingData`, `evaluatedWeight`); other users' and soft-deleted jobs → 404

Weight allocation (sums to 100): required skills 25, preferred skills 10, experience 20, role alignment 15, location/mode 15, salary 5, employment type 5, education 5. Unknown inputs are excluded from numerator and denominator (never assumed); zero evaluable factors scores 0 with an insufficient-data note. Overridable per call via `MatchWeights`.

### Applications (`/api/applications`, Phase 6)

Management, review, and approval only — no submission engine exists, so nothing here submits an application. Identity always comes from the JWT; every operation is owner-scoped.

- `POST /api/applications` — create a `DRAFT` for an owned job (201; 409 `CONFLICT` with `duplicateApplicationId` on live duplicates, including races). Embeds a job snapshot and the current match score/explanation. Requires a profile (404 without one).
- `GET /api/applications?status=&jobId=&page=&pageSize=` — paginated listing with status/job filters
- `GET /api/applications/:id` — one application; `GET /api/applications/:id/events` — ordered audit history
- `PATCH /api/applications/:id` — draft fields only (`resumeId`, `mode`, `materials`); anything else, including `status`, is rejected
- `POST /api/applications/:id/request-review` — `DRAFT` → `READY_FOR_REVIEW` (auto mode) or `AWAITING_APPROVAL` (permission mode). Requires a selected resume; unverified/sensitive answers need `confirmUnverified: true` (422 listing them otherwise).
- `POST /api/applications/:id/approve` — `{decision: approve|reject}` from review states → `APPROVED` / `CANCELLED`. Approval records a decision only (`attemptCount` stays 0).
- `POST /api/applications/:id/cancel` — from draft/review/approval/failure/manual-action states

Lifecycle: `DRAFT → READY_FOR_REVIEW | AWAITING_APPROVAL → APPROVED → (submission engine, Phase 7+)`, with `CANCELLED` reachable from all pre-submission states and `SUBMITTED` terminal. `SUBMITTING`/`SUBMITTED`/`FAILED`/`NEEDS_MANUAL_ACTION` are system-actor-only: user requests targeting them are rejected. Duplicate protection: partial unique index on `(userId, jobId)` excluding cancelled applications, plus optional client idempotency keys.

### Application materials (`/api/applications/:id/materials`, Phase 7)

AI-generated drafts from verified profile, resume, and job data only. Provider abstraction: deterministic `mock` (default, template-based, no model needed) and local `ollama` (`OLLAMA_BASE_URL`/`OLLAMA_MODEL`, 8GB RAM class hardware for 8b models); `openai` is rejected as unimplemented. Model output is JSON-parsed, Zod-validated, and code-guarded (resume `skillsUsed` intersected with verified skills; required-skill gaps always flagged; answers always enter unverified). Provider failures surface as generic `AI_PROVIDER_ERROR` (502) with no prompts, facts, or keys leaked.

- `POST .../materials/cover-letter` (`{replace?}`) — cover-letter draft; 409 if one exists without `replace`
- `POST .../materials/resume` (`{replace?}`) — tailored resume draft; original resume untouched
- `POST .../materials/answers` (`{question, replace?}`) — answer draft, always `verified: false`
- `GET .../materials` — saved drafts with provenance (`provider`, `model`, profile/resume/job versions) and review state
- `PATCH .../materials` — candidate edits (user edits preserved: regeneration without `replace` is rejected)
- `POST .../materials/review` — mark reviewed (review only; no status change, no approval)

Generation and editing require `DRAFT` status, so approved materials are immutable and drafts can never become `SUBMITTED` through these paths.

### Platforms (`/api/platforms`, Phase 8)

Researched capability matrix — no platform has a verified automatic-submission path, so nothing here submits. Submission is never inferred from discovery; unknown fails closed.

- `GET /api/platforms` — all six descriptors (`linkedin`, `indeed`, `naukri`, `apna`, `wellfound`, `career-site`) with eight independently graded capabilities (discovery, detail, questions, prepare, upload, submit, verify, handoff) plus evidence and authorization notes
- `GET /api/platforms/:platform` — one descriptor (404 unknown)
- `GET /api/platforms/settings/submission` — caller settings with safe defaults (`dailyLimit` 10, `minMatchScore` 80, unpaused)
- `PUT /api/platforms/settings/submission` — user-scoped singleton (global pause, daily limit 1–100, per-platform `auto|permission|disabled` + `authorized`)
- `POST /api/applications/:id/policy` (`{platform}`) — stateless policy evaluation: `auto_allowed | approval_required | manual_only | blocked` with reasons (ownership, capability, authorization, threshold, eligibility, confirmations, daily budget, duplicates, pause)
- `POST /api/applications/:id/handoff` — APPROVED-only safe handoff: records the event, moves to `NEEDS_MANUAL_ACTION` (system actor) with completion instructions, returns the platform application URL. Opening the page never marks anything submitted.

Capability findings: LinkedIn submission unsupported (partner-only Apply Connect/posting APIs, new partnerships closed); Indeed apply/detail paths robots-disallowed; Naukri bot-walled with no public API; Apna discovery unverified; Wellfound recruiter-side only; career sites per-site. Handoff supported everywhere (user-controlled, no automation). No real integration selected — mock submission adapter exists for deterministic tests only and is explicitly labeled.

## Planned (not implemented)

- Job matching/scoring, application workflow, approval/policy engine, platform adapters beyond manual+mock, AI providers, browser automation

## Rate Limits

| Endpoint | Limit |
| --- | --- |
| `POST /api/auth/register` | 5 requests/minute/IP |
| `POST /api/auth/login` | 10 requests/minute/IP |
| `POST /api/auth/refresh` | 20 requests/minute/IP |

Rate limited responses return `429 Too Many Requests` with `Retry-After` header.