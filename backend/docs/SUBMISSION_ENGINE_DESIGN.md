# Submission Engine Design (Phase 8.3.5A)

## Current architecture map
- Policy: SubmissionPolicy.evaluateSubmissionPolicy
- Orchestrator: SubmissionOrchestrator.preflightSubmission
- Adapter: SubmissionAdapter / MockSubmissionAdapter / submissionRegistry
- Reservation: DailySubmissionReservationService (reserve/finalize/release)
- Attempt persistence: SubmissionAttempt model/repository
- Reconciliation: SubmissionReconciliationService
- Lifecycle: ApplicationService.assertTransitionAllowed

## Proposed SubmissionEngine interface
- execute(userId, applicationId, platform, idempotencyKey, fingerprint): ExecutionResult

## Execution sequence
1. authenticate/ownership
2. preflight policy
3. createOrGet attempt
4. reserve capacity
5. claimExecuting
6. adapter.submit
7. recordOutcome
8. finalize/release reservation
9. log events
10. return result

## State transition table
REQUESTED->VALIDATING->RESERVED->EXECUTING->SUCCEEDED/FAILED/UNCERTAIN->REQUIRES_MANUAL_REVIEW

## Dependencies
Engine depends on orchestrator, policy, adapter registry, reservation, attempt repo, reconciliation, application service.

## Error/crash recovery
- before adapter: retry safe if REQUESTED/RESERVED
- after adapter: uncertain, no retry
- DB failure during outcome: retry persistence only

## Transaction boundaries
- reservation: atomic counter+reservation
- attempt claim/outcome: atomic conditional updates
- reconciliation: transaction for attempt+audit

## Idempotency
- compound unique (userId,applicationId,idempotencyKey)
- fingerprint mismatch rejects

## Reservation lifecycle
- reserve before execution
- finalize after attempt
- release only definite pre-execution failure
- retain on uncertain

## Required tests
- success, failure, uncertain, missing adapter, unsupported platform, global pause, approval, invalid lifecycle, cross-user, duplicate key, limit, finalization, release, uncertain retention, no SUBMITTED, no repeated execution

## Files to create/modify
- src/services/SubmissionEngine.ts (future)
- tests/submissionEngine.test.ts

## Gaps
- No route endpoint yet
- No real adapters (intentional)

Verdict: READY WITH LIMITATIONS (mock adapter only; replica-set tests pass)
