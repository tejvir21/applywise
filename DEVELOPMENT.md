# Development

## Prerequisites

- Node.js 20+
- MongoDB 7+ listening on `127.0.0.1:27017` (optional for Phase 1; health becomes `degraded` without it)
- Git

## Environment

Copy [`.env.example`](./.env.example) to `backend/.env` (and optionally the repo root). Do not commit `.env`.

| Variable | Purpose | Phase 1 default |
| --- | --- | --- |
| `NODE_ENV` | `development` / `test` / `production` | `development` |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `debug` |
| `PORT` | HTTP server port | `8000` |
| `MONGODB_URI` | Mongo connection string | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | Database name | `ai_job_application_agent` |
| `JWT_ACCESS_SECRET` | Access token secret (min 32 chars) | placeholder |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) | placeholder |
| `JWT_ACCESS_TTL_MINUTES` | Access token TTL | `15` |
| `JWT_REFRESH_TTL_DAYS` | Refresh token TTL | `30` |
| `CLIENT_URL` | CORS origin(s), comma-separated | `http://127.0.0.1:5173` |
| `AI_PROVIDER` | `mock` / `openai` / `ollama` | `mock` |
| `OPENAI_API_KEY` | External AI (unused in Phase 1) | empty |
| `OLLAMA_BASE_URL` | Local model host | `http://127.0.0.1:11434` |
| `STORAGE_PROVIDER` | `local` / `supabase` | `local` |
| `LOCAL_STORAGE_PATH` | Local file upload path | `./storage/uploads` |
| `RESUME_STORAGE_FALLBACK` | `local` (explicit persistent fallback) / `none` | `none` |
| `RESUME_STORAGE_PATH` | Persistent local dir (absolute mount path in prod) | `./storage/uploads` |
| `SUPABASE_URL` | Supabase project URL (https, required for `supabase`) | empty |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) | empty |
| `SUPABASE_RESUME_BUCKET` | Private Supabase bucket for resumes | `resumes` |
| `SUPABASE_TIMEOUT_MS` | Per-request timeout for Supabase (ms) | `8000` |
| `SUPABASE_MAX_RETRIES` | Retry budget for transient Supabase failures | `2` |
| `BROWSER_AUTOMATION_PROVIDER` | `mock` / `playwright` | `mock` |
| `VITE_API_BASE_URL` | Frontend API origin (bare origin, NO `/api` suffix — all client paths already start with `/api`) | empty (= Vite proxy) |

## Backend

```powershell
cd backend
npm install
cp .env.example .env
npm run dev
```

- Health: `http://127.0.0.1:8000/api/health`
- API root: `http://127.0.0.1:8000/api`

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

The API starts even if MongoDB is down. `GET /api/health` then returns `"status": "degraded"` and `"mongodb": "disconnected"`.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`.

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## MongoDB (local)

Install MongoDB Community or run Docker:

```powershell
docker run -d --name applywise-mongo -p 27017:27017 mongo:7
```

Atlas is supported by changing `MONGODB_URI`.

## Production deployment (Render backend + Vercel frontend)

Backend (Render web service, Node 20+):
- `NODE_ENV=production`, `PORT` as provided, `MONGODB_URI` (Atlas), long random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (startup refuses `change-me` placeholders).
- `CLIENT_URL=https://<your-vercel-app>.vercel.app` — the exact frontend origin, no wildcard. CORS allows credentials only for these origins.
- Resume storage (Supabase preferred, persistent local fallback):
  - Preferred: `STORAGE_PROVIDER=supabase`, `SUPABASE_URL=https://<project>.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY=<service-role key, server-side only — never expose to the frontend>`, `SUPABASE_RESUME_BUCKET=resumes`. Create the bucket in the Supabase dashboard as **private** (never public); the backend uses only authenticated `/storage/v1/object/...` endpoints and never mints public or signed URLs. Uploads use a bounded timeout (`SUPABASE_TIMEOUT_MS`, default 8000) with a small retry budget (`SUPABASE_MAX_RETRIES`, default 2); ambiguous timeouts are resolved with an existence check before any fallback to avoid duplicates/orphans.
  - Fallback (explicit opt-in): `RESUME_STORAGE_FALLBACK=local` **only** when `RESUME_STORAGE_PATH` is an absolute path on a mounted persistent disk (Render dashboard → Disks → mount at e.g. `/var/data`, then `RESUME_STORAGE_PATH=/var/data/resumes`). Local fallback is safe **only** when persistent storage is actually configured — relative paths, `./storage/uploads`, and tmp directories are ephemeral and rejected at startup in production.
  - Startup refuses to boot in production when Supabase credentials are missing/invalid and no durable fallback is configured, instead of silently using ephemeral storage. `GET /api/health` reports sanitized storage status (`active`/`primary`/`fallback`/`healthy`/`durable`, no secrets or paths).
  - Legacy resume documents without `storageProvider` default to `local` (all pre-Supabase versions were local-only). Run `node scripts/backfill-resume-storage-provider.mjs --dry-run` (then without the flag) to make the default explicit. Unrecognized provider values fail reads/deletes with 409 for reconciliation — files are never auto-migrated or auto-deleted.
- Cookies in production are `HttpOnly`, `Secure`, `SameSite=None`, path `/api/auth` — requires HTTPS on the backend (Render provides it).

Frontend (Vercel static):
- `VITE_API_BASE_URL=https://<your-render-service>.onrender.com` — the **bare backend origin**. Do NOT append `/api`: every client request path already begins with `/api`, so a suffixed value produces `/api/api/...` 404s.
- Sessions: the access token lives in memory; reloads restore via the `HttpOnly` refresh cookie, which requires third-party-cookie acceptance for the backend origin. If the browser blocks it, the app lands signed-out (no error loop).

Local development: run the frontend on the same hostname as `CLIENT_URL` (e.g. `http://127.0.0.1:5173`, not mixed `localhost`/`127.0.0.1`) so the `Lax` dev cookie is sent; Vite proxies `/api` to `http://127.0.0.1:8000` with an empty `VITE_API_BASE_URL`.

## AI in development

Leave `AI_PROVIDER=mock`. Tests must not require a paid API. Ollama and OpenAI adapters are designed for later phases; if Ollama is missing, later code must fail that feature gracefully, not crash the process.

## Git

Do not commit `.env`, `node_modules`, `.venv`, build output, or secrets.

Phase 1 commit message (when you choose to commit):

```
feat: initialize project architecture
```