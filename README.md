# AI Job Application Agent

Production-oriented job search assistant for a single candidate workflow: discover jobs, match them against a real profile and resume, generate truthful application materials, and submit only after explicit human approval.

This repository is a monorepo. **Phases 1–6 are implemented and verified:** foundation, JWT authentication, candidate profile + resume parsing, job management, deterministic job matching, and application management with review/approval. Submission, generation, and browser automation are not built yet.

Internal project name: `ai-job-application-agent`

## What exists in Phases 1–4

- Monorepo layout (`frontend/`, `backend/`, `scripts/`)
- Express + TypeScript API with configuration, structured logging, MongoDB lifecycle, CORS, and consistent error envelopes
- `GET /api/health` and `GET /api/health/live`
- `POST /api/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/auth/me`
- JWT access + refresh tokens with bcrypt password hashing
- Rate limiting on auth endpoints
- Candidate profile + preferences API with completeness reporting
- Resume upload (PDF/DOCX), parsing, analysis, and profile import
- Job management: manual entries, deterministic mock imports, search/filter/sort/pagination, save/unsave, ownership-checked update/soft-delete, duplicate prevention via unique `normalizedKey` and partial `(sources.name, sources.sourceJobId)` indexes
- Deterministic job matching: 0–100 fit score with per-factor explanations, missing-data reporting, and hard eligibility flags (excluded company/type); ranked listing with minimum-score filter; no AI provider involved
- Application management: persistent drafts with match/job snapshots, explicit state machine (DRAFT → READY_FOR_REVIEW/AWAITING_APPROVAL → APPROVED, CANCELLED branches), review/approval/rejection/cancellation with unverified-answer confirmations, per-user duplicate protection, and audit history; no submission engine
- React + TypeScript + Vite shell with routes (dashboard, jobs, applications placeholders, profile, resume, settings), layout, and API client
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

Phase 7: centralized submission-policy engine (authorization, limits, duplicates, confirmations) deciding auto vs. approval flows. No real platform submissions until policy enforcement is implemented and tested.