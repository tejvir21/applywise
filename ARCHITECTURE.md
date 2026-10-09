# Architecture

The application is a modular monolith with a TypeScript SPA and a TypeScript API. Providers for AI, job sources, file storage, and browser automation are behind interfaces so they can be swapped without rewriting domain logic.

## High-level view

```
Browser (React / Vite)
        |
        | JSON /api/*
        v
Express + TypeScript
  - src/routes      HTTP adapters
  - src/controllers Request handling
  - src/services    use cases
  - src/repositories MongoDB access (Mongoose)
  - src/models      Mongoose schemas
  - src/schemas     Zod validation
  - src/middleware  Cross-cutting concerns
  - src/ai          AIProvider (later)
  - src/jobs        JobSourceAdapter (later)
  - src/storage     StorageProvider (later)
  - src/automation  BrowserAutomationProvider (later)
        |
        v
MongoDB + local files (dev) + optional external AI
```

## Current phase

Phases 1–6 are implemented: process/config/logging/health/MongoDB/auth (JWT), frontend routing + API client, candidate profile + preferences, resume upload/parse/analysis/import, job management (`manual` + `mock` sources, search/filter/pagination, saved jobs, ownership-checked mutations, duplicate prevention), deterministic job matching (`JobMatchingService`: 0–100 score, explanations, eligibility flags; `GET /api/jobs/matches`, `GET /api/jobs/:id/match`; Jobs page integration), and application management (`Application`/`ApplicationEvent` models, `ApplicationService` state machine with user/system actors, `/api/applications` routes, Applications list + detail/review pages, in-memory frontend session), and AI-generated drafts (`src/ai` provider abstraction with mock + Ollama providers, `MaterialGenerationService` with honesty guards and provenance, materials endpoints, MaterialsEditor UI), and the platform foundation (`src/platforms` capability registry with researched evidence, separate submission contracts with a labeled mock adapter, fail-closed `SubmissionPolicy`, user-scoped `SubmissionSettings`, policy evaluation + safe handoff with readiness UI). No submission engine, platform credentials, or automation exist anywhere. `src/controllers/` is still unused (logic lives in services + routes).

## Backend layout

| Path | Role |
| --- | --- |
| `src/server.ts` | Entry point, graceful shutdown |
| `src/app.ts` | Express factory, middleware, routes |
| `src/config/index.ts` | Environment-backed settings (Zod) |
| `src/config/logger.ts` | Pino JSON logs with secret redaction |
| `src/config/database.ts` | Mongoose connection; degraded mode if Mongo is down |
| `src/middleware/errorHandler.ts` | Uniform `{ success, error }` responses |
| `src/middleware/auth.ts` | JWT verification middleware |
| `src/middleware/rateLimiter.ts` | In-memory token bucket rate limiting |
| `src/middleware/validate.ts` | Zod request validation |
| `src/utils/errors.ts` | Error classes and response envelopes |
| `src/utils/auth.ts` | JWT creation/validation, password hashing |
| `src/routes/auth.ts` | Authentication endpoints |
| `src/routes/health.ts` | Health check endpoints |
| `src/controllers/` | Request handlers (later) |
| `src/services/` | Business logic |
| `src/repositories/` | Data access layer |
| `src/models/` | Mongoose schemas |
| `src/schemas/` | Zod validation schemas |
| `src/ai/` | AIProvider abstraction (later) |
| `src/jobs/` | JobSourceAdapter abstraction: `manual` + `mock` implemented, registry present (adapters not yet registered for `/import/source`) |
| `src/applications/` | Application workflow (later) |
| `src/automation/` | BrowserAutomationProvider abstraction (later) |
| `src/storage/` | StorageProvider abstraction: `local` implemented |

## Frontend layout

| Path | Role |
| --- | --- |
| `src/pages/` | Route screens |
| `src/layouts/` | App chrome and auth chrome |
| `src/routes/` | React Router configuration |
| `src/services/` | HTTP client |
| `src/hooks/` | TanStack Query hooks |
| `src/stores/` | Zustand UI state |
| `src/components/ui/` | Primitive UI (shadcn-style) |
| `src/schemas/` | Zod contracts for API payloads |
| `src/types/` | Shared TypeScript types |
| `src/features/` | Feature modules as they grow |

## Provider contracts (later phases)

- **AIProvider**: `mock` (default), `openai`, `ollama`. Never call a provider unless configured. Validate all model JSON against schemas. Do not write application state from unvalidated model output.
- **JobSourceAdapter**: `manual`, `mock`, then legitimate APIs. Respect terms of service. Deduplicate on `source + sourceJobId`.
- **StorageProvider**: `local` in development; S3/Cloudinary later. No public resume URLs by default.
- **BrowserAutomationProvider**: `mock` in tests; Playwright isolated in Phase 9. Must pause on CAPTCHA/MFA. Must never bypass security controls.

## Application workflow (later)

Explicit state machine. Default path:

`DISCOVERED → MATCHED → REVIEW_REQUIRED → APPROVED → PREPARING → READY_TO_SUBMIT → SUBMITTED`

Human approval is required before final submission. The API must not auto-submit.

## Data ownership

Users may only read and write their own profile, resumes, matches, and applications. Authorization is enforced via JWT middleware.

## Deployment

- Frontend: static host (Vercel, Netlify)
- Backend: Node.js host (Render, Railway, Fly.io)
- Database: local MongoDB or Atlas

Application code must not assume a specific vendor beyond environment variables.