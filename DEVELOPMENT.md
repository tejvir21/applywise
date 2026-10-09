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
| `STORAGE_PROVIDER` | `local` / `s3` / `cloudinary` | `local` |
| `LOCAL_STORAGE_PATH` | Local file upload path | `./storage/uploads` |
| `BROWSER_AUTOMATION_PROVIDER` | `mock` / `playwright` | `mock` |
| `VITE_API_BASE_URL` | Frontend API origin; empty uses Vite proxy | empty |

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

## AI in development

Leave `AI_PROVIDER=mock`. Tests must not require a paid API. Ollama and OpenAI adapters are designed for later phases; if Ollama is missing, later code must fail that feature gracefully, not crash the process.

## Git

Do not commit `.env`, `node_modules`, `.venv`, build output, or secrets.

Phase 1 commit message (when you choose to commit):

```
feat: initialize project architecture
```