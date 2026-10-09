# AI Job Application Agent

Production-oriented job search assistant for a single candidate workflow: discover jobs, match them against a real profile and resume, generate truthful application materials, and submit only after explicit human approval.

This repository is a monorepo. **Phases 1–8 are implemented and verified:** foundation, JWT authentication, candidate profile + resume parsing, job management, deterministic job matching, application management with review/approval, AI-generated application drafts, and the multi-platform integration foundation (capability registry, fail-closed submission policy, safe handoff; no real submission anywhere). Browser automation is not built.

Internal project name: `ai-job-application-agent`

## What exists in Phases 1–4

- Monorepo layout (`frontend/`, `backend/`, `scripts/`)
- Express + TypeScript API with configuration, structured logging, MongoDB lifecycle, CORS, and consistent error envelopes
- `GET /api/health` and `GET /api/health/live`
- `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/auth/me`
- JWT access + rotating refresh tokens with bcrypt password hashing; refresh sessions are server-tracked (logout/rotation revoke, replays rejected); browser sessions persist via HttpOnly cookies
- Rate limiting on auth endpoints
- Candidate profile + preferences API with completeness reporting (no web editor yet)
- Resume upload (multipart PDF/DOCX up to 10 MB, content-verified), local parsing, analysis with failure capture, and non-overwriting profile import; production needs durable storage at `RESUME_STORAGE_PATH`
- Job management: manual entries, deterministic mock imports, search/filter/sort/pagination, save/unsave, ownership-checked update/soft-delete, duplicate prevention via unique `normalizedKey` and partial `(sources.name, sources.sourceJobId)` indexes
- Deterministic job matching: 0–100 fit score with per-factor explanations, missing-data reporting, and hard eligibility flags (excluded company/type); ranked listing with minimum-score filter; no AI provider involved
- Application management: persistent drafts with match/job snapshots, explicit state machine (DRAFT → READY_FOR_REVIEW/AWAITING_APPROVAL → APPROVED, CANCELLED branches), review/approval/rejection/cancellation with unverified-answer confirmations, per-user duplicate protection, and audit history; no submission engine
- AI-generated drafts: provider abstraction with deterministic mock (default) and local Ollama support; cover letters, tailored resume drafts, and answers built only from verified data with code-enforced honesty guards, provenance tracking, and review workflows; original resume never modified
- Platform foundation: researched capability matrix (no verified submission path on any requested platform), separate discovery/submission adapter contracts, labeled mock submission adapter for tests only, fail-closed policy evaluation, user-scoped submission settings, and safe handoff (approved → manual completion, never submitted)
- React + TypeScript + Vite app with working sign-in, jobs matching, resume management, job detail, applications list + detail/review, and platform readiness UI (profile/preferences pages have no web editor yet)
- Local development that runs **without** a paid AI provider
- Documentation for architecture, security, development, and the current API

## Non-goals for this phase

- No resume parsing or job ingestion
- No AI calls
- No Playwright automation
- No claim that any application was submitted

## Local setup

See [DEVELOPMENT.md](./DEVELOPMENT.md) for commands, environment variables, and MongoDB.

Quick start (two terminals):

```bash
# backend
cd backend
npm install
cp .env.example .env
npm run dev
```

```bash
# frontend
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The dashboard reports API and MongoDB health.

## Tests

```bash
# backend
cd backend
npm test
npm run typecheck
npm run lint
npm run build

# frontend
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system boundaries and extension points
- [SECURITY.md](./SECURITY.md) — auth, privacy, automation limits
- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup, env, testing
- [API.md](./API.md) — current HTTP contract

## Next step

Verification of a first real platform integration (only with documented authorization), then browser automation strictly within permitted workflows. No submission claims until end-to-end verification exists.