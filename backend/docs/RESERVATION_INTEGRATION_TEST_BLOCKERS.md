# Reservation Integration Test Blockers

## Infrastructure
- Smoke test: tests/integration/replica.smoke.test.ts
- Config: vitest.integration.config.ts
- Service: src/services/DailySubmissionReservationService.ts
- Models: src/models/DailySubmissionCounter.ts, src/models/SubmissionReservation.ts

## Required setup
- MongoMemoryReplSet create, mongoose.connect, cleanup collections, disconnect/stop.

## Blockers
1. No existing integration test calling real service; need to import and invoke reserveDailySubmission.
2. Global setup not used in integration config; Mongoose connection must be established manually.
3. Transaction safety unverified due to lack of tests.

## Smallest next step
- Add one same-key concurrency test using existing smoke setup, calling reserveDailySubmission 20 times with Promise.all.
