# Database Schema

## Application Preparation (`ApplicationPreparation` model)

Collection: `applicationpreparations`

Core fields:
- `userId` (ObjectId, ref: User, indexed) — owner of the preparation
- `jobId` (ObjectId, ref: Job, indexed) — target job
- `jobSnapshot` — `{ title, companyName }` captured at preparation start
- `resumeId` (ObjectId, ref: Resume) — original resume reference (never modified)
- `resumeVersion` (Number, min: 1)
- `status` (enum: DRAFT, IN_PROGRESS, READY_FOR_REVIEW, APPROVED, REJECTED, CANCELLED, indexed)
- `missingInformation` (string[]) — profile fields the candidate still needs to provide
- `rejectionNote` (string) — optional note captured when rejected
- `tailoredResume` — generated, candidate-reviewed resume draft
- `coverLetter` — generated, candidate-reviewed cover letter draft
- `answers` — generated, candidate-reviewed application question answers
- `materialsProvenance` — `{ provider, model, generatedAt, profileUpdatedAt, resumeId, resumeVersion, jobId }`
- `createdAt`, `updatedAt` (timestamps)

### Tailored resume subdocument
- `summary`, `highlights[]`, `skillsUsed[]`, `flaggedGaps[]`, `generatedAt`
- `reviewStatus` (enum: PENDING, APPROVED, REJECTED)
- `reviewedAt`, `reviewerNote`
- `verification` (Phase 8.3.15) — `{ status: VERIFIED|UNSUPPORTED|NEEDS_CANDIDATE_INPUT, reason?, matchedFacts[], unsupportedClaims[] }`

### Cover letter subdocument
- `body`, `flaggedGaps[]`, `generatedAt`
- `reviewStatus` (enum: PENDING, APPROVED, REJECTED)
- `reviewedAt`, `reviewerNote`
- `verification` (Phase 8.3.15) — same shape as tailored resume

### Prepared answer subdocument
- `question`, `answer`, `verified` (boolean), `sensitive` (boolean), `source?`
- `reviewStatus` (enum: GENERATED, NEEDS_CANDIDATE_INPUT, NEEDS_REVIEW, APPROVED, REJECTED)
- `reviewedAt`, `reviewerNote`
- `verification` (Phase 8.3.15) — same shape as tailored resume

### Indexes
- `{ userId: 1, jobId: 1 }` unique, partial filter `{ status: { $ne: 'CANCELLED' } }` — one active preparation per candidate+job
- `{ userId: 1, status: 1, createdAt: -1 }`
- `{ userId: 1, createdAt: -1 }`

### State machine
```
DRAFT -> IN_PROGRESS   (first generation/edit)
DRAFT -> CANCELLED
IN_PROGRESS -> DRAFT   (pause/save)
IN_PROGRESS -> READY_FOR_REVIEW  (all components generated)
READY_FOR_REVIEW -> APPROVED     (final approval, all components APPROVED + consistency check)
READY_FOR_REVIEW -> REJECTED     (rejection)
READY_FOR_REVIEW -> IN_PROGRESS  (back to editing)
APPROVED -> DRAFT    (reopen for editing)
REJECTED -> DRAFT    (reopen for editing)
CANCELLED -> (terminal)
```

APPROVED requires every generated component (tailored resume, cover letter, each answer) to have `reviewStatus === 'APPROVED'`, plus a cross-component consistency check (no conflicting dates, skills, company, or job title).

### Submission safety
There is no `SUBMITTING` or `SUBMITTED` state. No transition to submission exists. Application preparation is draft-only and read-only with respect to submission.
