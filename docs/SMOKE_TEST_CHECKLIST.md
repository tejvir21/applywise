# Smoke Test Checklist

## Pre-requisites

- Backend running on `http://127.0.0.1:8000`
- Frontend running on `http://127.0.0.1:5173`
- MongoDB connected
- `AI_PROVIDER=mock` (default, no external dependencies)

## Automated Checks

### 1. Backend starts successfully
```bash
cd backend && npm run build && npm start
```
Expected: Server starts on configured port, logs "Server started".

### 2. Database connects
```bash
curl http://127.0.0.1:8000/api/health
```
Expected: `{ "success": true, "data": { "status": "ok", "mongodb": "connected" } }`

### 3. Health endpoint reports readiness
```bash
curl http://127.0.0.1:8000/api/health/live
```
Expected: `{ "success": true, "data": { "status": "ok" } }`

### 4. Registration works
```bash
curl -X POST http://127.0.0.1:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"password123"}'
```
Expected: 201 with `access_token` in response.

### 5. Login works
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"password123"}'
```
Expected: 200 with `access_token` in response.

### 6. Profile retrieval works
```bash
# Create profile first
curl -X POST http://127.0.0.1:8000/api/profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"smoke@test.com"}'

# Get profile
curl http://127.0.0.1:8000/api/profile \
  -H "Authorization: Bearer <token>"
```
Expected: 200 with profile data.

### 7. Resume upload works
```bash
curl -X POST http://127.0.0.1:8000/api/resumes \
  -H "Authorization: Bearer <token>" \
  -F "file=@test-resume.pdf"
```
Expected: 201 with resume metadata.

### 8. Resume download requires ownership
```bash
# As a different user
curl http://127.0.0.1:8000/api/resumes/<resumeId>/download \
  -H "Authorization: Bearer <other-user-token>"
```
Expected: 404 (not 200).

### 9. Job listing works
```bash
curl http://127.0.0.1:8000/api/jobs \
  -H "Authorization: Bearer <token>"
```
Expected: 200 with job list.

### 10. Application preparation creation works
```bash
curl -X POST http://127.0.0.1:8000/api/application-preparations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"<jobId>"}'
```
Expected: 201 with preparation ID.

### 11. AI generation respects rate limits
```bash
# Make 11 rapid AI generation requests (limit is 10/min)
for i in $(seq 1 11); do
  curl -X POST http://127.0.0.1:8000/api/application-preparations/<prepId>/tailor-resume \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{}'
done
```
Expected: First 10 return 200, 11th returns 429 with `Retry-After` header.

### 12. Candidate approval enforces component-level provenance
```bash
# Generate content, then update profile, then try to approve
# Should return 422 VALIDATION_ERROR
```
Expected: 422 with `VALIDATION_ERROR` code.

### 13. Logout invalidates session
```bash
curl -X POST http://127.0.0.1:8000/api/auth/logout \
  -H "Authorization: Bearer <token>"
# Then try to access a protected endpoint
curl http://127.0.0.1:8000/api/profile \
  -H "Authorization: Bearer <token>"
```
Expected: Logout returns 200, subsequent request returns 401.

## Important Notes

- Do not run smoke tests against production without explicit authorization.
- Use isolated test data (test database, not production).
- No real job applications are submitted during smoke testing.
- ApplyWise remains submission-disabled.