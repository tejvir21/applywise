# Security

Treat candidate data (resumes, contact details, work history) as private.

## Current controls (Phase 1)

- Secrets live in environment variables. `.env` is gitignored. `.env.example` has no real keys.
- Structured logs redact passwords, tokens, API keys, and JWT secrets.
- API errors use a fixed envelope. Unhandled exceptions return `INTERNAL_ERROR` without stack traces.
- CORS is limited to `CLIENT_URL`.
- MongoDB connection failure does not crash the API; health reports `degraded`.
- Production startup refuses placeholder JWT secrets (`assert_secrets_configured`).
- bcrypt password hashing (cost factor 12).
- Short-lived access JWT (15 min) + refresh token (30 days) with rotation.
- Rate limits on register (5/min), login (10/min), refresh (20/min) endpoints.
- Protected routes via JWT middleware and current-user endpoint.

Never log passwords, refresh tokens, or JWT secrets.

## Authorization

Every profile, resume, job-match, and application query must be scoped to the authenticated user. Object IDs in URLs are not an access grant.

## Files (Phase 4)

- Allow-list MIME/types (PDF, DOCX)
- Size limits
- Safe stored filenames
- Path traversal protection
- Private storage; no public resume URLs by default

## AI (Phase 7)

- Do not send candidate data to an external provider unless the operator configures it.
- Default provider is `mock`.
- Validate model output. Malformed output fails the analysis; it does not mutate critical state.
- Never invent employment, education, skills, salary, visa, or other facts.

## Browser automation (Phase 9)

The automation layer must not:

- Bypass CAPTCHA, MFA, bot detection, paywalls, or access controls
- Use stolen credentials
- Claim a submission succeeded unless the workflow completed

CAPTCHA/MFA → pause, `HUMAN_ACTION_REQUIRED`, human continues.

## SSRF

When the product fetches job URLs or opens pages, validate schemes/hosts. Do not fetch internal metadata endpoints. Details land with job import and automation.

## Audit log (later)

Sensitive actions (login, resume upload, approval, submit, automation start) write `ApplicationEvent` / `AuditLog` records without secret payloads.