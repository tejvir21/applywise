/** Browser automation routes (Phase 9.1).
 *
 * Authenticated, owner-scoped APIs for browser-based form inspection
 * and filling. Does NOT submit applications.
 */

import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import crypto from 'crypto';
import { BrowserAutomationExecutionModel } from '../models/BrowserAutomationExecution.js';
import { BrowserAutomationExecutionRepository } from '../repositories/BrowserAutomationExecutionRepository.js';
import { browserAutomationEngine } from '../automation/BrowserAutomationEngine.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimitAiGeneration } from '../middleware/rateLimiter.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { ApplicationPreparationModel } from '../models/ApplicationPreparation.js';
import { ResumeModel } from '../models/Resume.js';
import { JobModel } from '../models/Job.js';
import { CandidateProfileModel } from '../models/CandidateProfile.js';

/** Compute a deterministic fingerprint of the execution's reviewable data.
 *  Used to detect stale approvals when answers, resume, or job data change.
 *  Canonicalizes objects deterministically before hashing; avoids unstable
 *  timestamps and arbitrary key ordering. */
function canonicalize(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj.toString() : 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const items = obj.map(canonicalize);
    // Sort for deterministic ordering when array contains objects
    if (items.some((c) => typeof c === 'object' && c !== null)) {
      const sorted = items.slice().sort();
      return '[' + sorted.join(',') + ']';
    }
    return '[' + items.join(',') + ']';
  }

  // Plain object: sort keys recursively for deterministic output
  const entries: [string, string][] = [];
  for (const key of Object.keys(obj).sort()) {
    try {
      entries.push([key, canonicalize(obj[key])]);
    } catch {
      // skip keys that can't be serialized
    }
  }
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + v).join(',') + '}';
}

function compareStrings(a: string, b: string): number {
  return a > b ? 1 : a < b ? -1 : 0;
}

async function computeApprovalFingerprint(execution: any): Promise<string> {
  // --- Candidate profile ---
  let profileHash: string | null = null;
  if (execution.userId) {
    try {
      const { CandidateProfileModel } = await import('../models/CandidateProfile.js');
      const profile: any = await (CandidateProfileModel as any).findById(execution.userId).lean();
      if (profile) {
        // Hash the verified profile facts that affect application content.
        const profileSkills: any[] = [];
        if (profile.skills) {
          const skillsArr = Array.isArray(profile.skills) ? profile.skills : [profile.skills];
          for (const s of skillsArr) {
            if (s && typeof s === 'object' && s.name) {
              profileSkills.push(s.name);
            }
          }
        }
        profileSkills.sort();

        const profileData: any = {
          skills: profileSkills,
          experience: profile.yearsOfExperience,
          education: [],
          location: profile.location,
        };
        // Add education institutions
        if (profile.education) {
          const eduArr = Array.isArray(profile.education) ? profile.education : [profile.education];
          for (const e of eduArr) {
            if (e && typeof e === 'object' && e.institution) {
              profileData.education.push({
                institution: e.institution,
                degree: e.degree,
              });
            }
          }
          profileData.education.sort(function (a: any, b: any): number {
            return a.institution > b.institution ? 1 : a.institution < b.institution ? -1 : 0;
          });
        }

        profileHash = crypto.createHash('sha256').update(canonicalize(profileData)).digest('hex');
      }
    } catch {
      /* best-effort */ }
  }

  // --- Resume ---
  let resumeHash: string | null = null;
  let resumeVersion: string | null = null;
  let resumeStorageKey: string | null = null;
  if (execution.selectedResumeId) {
    try {
      const resume: any = await ResumeModel.findById(execution.selectedResumeId).lean();
      if (resume) {
        resumeVersion = resume.version?.toString() ?? null;
        resumeStorageKey = resume.storageKey ?? resume.storedFilename ?? null;
        // Hash the structured resume data that affects application content.
        const structuredData: any = resume.structuredData
          ? {
              personal: resume.structuredData.personal,
              summary: resume.structuredData.summary,
              skills: (resume.structuredData.skills || [])
                .sort()
                .map((s: any) => ({
                  name: s.name,
                  category: s.category,
                })),
              experience: (resume.structuredData.experience || [])
                .sort()
                .map((e: any) => ({
                  title: e.title,
                  company: e.company,
                  startDate: e.startDate,
                  endDate: e.endDate,
                })),
              education: (resume.structuredData.education || [])
                .sort()
                .map((e: any) => ({
                  institution: e.institution,
                  degree: e.degree,
                })),
            }
          : null;
        resumeHash = structuredData
          ? crypto.createHash('sha256').update(canonicalize(structuredData)).digest('hex')
          : null;
      }
    } catch {
      /* best-effort */ }
  }

  // --- Job ---
  let jobHash: string | null = null;
  let jobUpdatedAt: string | null = null;
  if (execution.jobId) {
    try {
      const job: any = await JobModel.findById(execution.jobId).lean();
      if (job) {
        jobUpdatedAt = job.updatedAt?.toISOString?.() ?? null;
        // Hash authoritative job content that affects application mapping.
        const jobData: any = {
          title: job.title,
          companyName: job.companyName,
          description: job.description,
          responsibilities: (job.responsibilities || []).sort(),
          requirements: (job.requirements || []).sort(),
          requiredSkills: (job.requiredSkills || [])
            .sort()
            .map((s: any) => ({ name: s.name, required: s.required })),
          preferredSkills: (job.preferredSkills || [])
            .sort()
            .map((s: any) => ({ name: s.name, required: s.required })),
          employmentType: job.employmentType,
          experienceLevel: job.experienceLevel,
          remoteType: job.remoteType,
          salaryCurrency: job.salaryCurrency,
          salaryPeriod: job.salaryPeriod,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          applicationUrl: job.applicationUrl,
        };
        jobHash = crypto.createHash('sha256').update(canonicalize(jobData)).digest('hex');
      }
    } catch {
      /* best-effort */ }
  }

  // --- Application preparation ---
  let preparationHash: string | null = null;
  let tailoredResumeHash: string | null = null;
  let coverLetterHash: string | null = null;
  let answersHash: string | null = null;
  if (execution.preparationId) {
    try {
      const prep: any = await ApplicationPreparationModel.findById(execution.preparationId).lean();
      if (prep) {
        preparationHash = crypto
          .createHash('sha256')
          .update(canonicalize({
            status: prep.status,
            missingInformation: prep.missingInformation,
            jobSnapshot: prep.jobSnapshot,
            resumeVersion: prep.resumeVersion,
          }))
          .digest('hex');

        // Tailored resume content
        if (prep.tailoredResume) {
          tailoredResumeHash = crypto
            .createHash('sha256')
            .update(canonicalize({
              summary: prep.tailoredResume.summary,
              highlights: prep.tailoredResume.highlights.sort(),
              skillsUsed: prep.tailoredResume.skillsUsed.sort(),
              flaggedGaps: prep.tailoredResume.flaggedGaps.sort(),
              generatedAt: prep.tailoredResume.generatedAt,
              reviewStatus: prep.tailoredResume.reviewStatus,
            }))
            .digest('hex');
        }

        // Cover letter content
        if (prep.coverLetter) {
          coverLetterHash = crypto
            .createHash('sha256')
            .update(canonicalize({
              body: prep.coverLetter.body,
              flaggedGaps: prep.coverLetter.flaggedGaps.sort(),
              generatedAt: prep.coverLetter.generatedAt,
              reviewStatus: prep.coverLetter.reviewStatus,
            }))
            .digest('hex');
        }

        // Application question answers
        if (prep.answers && prep.answers.length > 0) {
          const answerData: any[] = prep.answers.map((a: any) => ({
            question: a.question,
            answer: a.answer,
            source: a.source,
            reviewStatus: a.reviewStatus,
            verified: a.verified,
          }));
          answerData.sort(function (a: any, b: any): number {
            return a.question > b.question ? 1 : a.question < b.question ? -1 : 0;
          });
          answersHash = crypto
            .createHash('sha256')
            .update(canonicalize(answerData))
            .digest('hex');
        }
      }
    } catch {
      /* best-effort */ }
  }

  // --- Detected fields and mappings ---
  const fieldMappings = (execution.fieldMappings || [])
    .map((m: any) => ({
      fieldId: m.fieldId,
      value: m.value,
      result: m.result,
      verified: m.verified,
    })).sort(function (a: any, b: any): number {
      return a.fieldId > b.fieldId ? 1 : a.fieldId < b.fieldId ? -1 : 0;
    });

  const detectedFields = (execution.detectedFields || [])
    .map((f: any) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
    })).sort(function (a: any, b: any): number {
      return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
    });

  // --- Canonical bundle ---
  const canonical = crypto
    .createHash('sha256')
    .update(
      canonicalize({
        // Candidate profile hash (authoritative verified facts)
        profileHash,
        // Resume hash and version (authoritative content)
        resumeHash,
        resumeVersion,
        resumeStorageKey,
        // Job hash (authoritative job content)
        jobHash,
        jobUpdatedAt,
        // Preparation hash (authoritative generated content)
        preparationHash,
        tailoredResumeHash,
        coverLetterHash,
        answersHash,
        // Execution-scoped mapping and field data
        fieldMappings,
        detectedFields,
        // Execution identifiers
        selectedResumeId: execution.selectedResumeId?.toString() ?? null,
        applicationUrl: execution.applicationUrl,
        jobId: execution.jobId?.toString() ?? null,
        preparationId: execution.preparationId?.toString() ?? null,
        // Stored fingerprint for comparison
        approvalFingerprint: execution.approvalFingerprint,
      })
    )
    .digest('hex');

  return canonical;
}

const router = Router();
router.use(authMiddleware);

const repo = new BrowserAutomationExecutionRepository();

// Valid state transitions (Phase 9.1.1)
const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['INSPECTING', 'CANCELLED'],
  INSPECTING: ['FORM_DETECTED', 'FAILED', 'CANCELLED', 'REQUIRES_MANUAL_ACTION', 'PAUSED'],
  FORM_DETECTED: ['AWAITING_CANDIDATE_INPUT', 'READY_FOR_REVIEW', 'CANCELLED'],
  AWAITING_CANDIDATE_INPUT: ['READY_FOR_REVIEW', 'CANCELLED'],
  READY_FOR_REVIEW: ['APPROVED_FOR_EXECUTION', 'CANCELLED'],
  APPROVED_FOR_EXECUTION: ['FILLING', 'CANCELLED'],
  FILLING: ['FILLED', 'PAUSED', 'FAILED', 'CANCELLED'],
  FILLED: ['CANCELLED'],
  PAUSED: ['FILLING', 'INSPECTING', 'CANCELLED', 'REQUIRES_MANUAL_ACTION'],
  FAILED: ['CANCELLED', 'REQUIRES_MANUAL_ACTION'],
  CANCELLED: [],
  REQUIRES_MANUAL_ACTION: ['INSPECTING', 'CANCELLED'],
};

function canTransitionState(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

function getUserId(req: AuthenticatedRequest): Types.ObjectId {
  return new Types.ObjectId(req.user!.sub);
}

const createExecutionSchema = z.object({
  body: z.object({
    applicationUrl: z.string().url().max(2000),
    jobId: z.string().optional(),
    preparationId: z.string().optional(),
    resumeId: z.string().optional(),
    platform: z.string().max(50).optional(),
  }).strict(),
});
                       
// Param schema for execution ID (single or array)
const executionIdParamSchema = z.object({
  id: z.string().transform((val) => (Array.isArray(val) ? val : [val])).refine(
    (val) => val.length === 1,
    { message: 'Execution ID is required' }
  ),
});

// POST /api/automation/executions - Create a new execution
router.post('/', rateLimitAiGeneration, validate(createExecutionSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const { applicationUrl, jobId, preparationId, resumeId, platform } = req.body as {
    applicationUrl: string;
    jobId?: string;
    preparationId?: string;
    resumeId?: string;
    platform?: string;
  };

  const execution = await repo.create({
    userId,
    applicationUrl,
    jobId: jobId ? new Types.ObjectId(jobId) : undefined,
    preparationId: preparationId ? new Types.ObjectId(preparationId) : undefined,
    selectedResumeId: resumeId ? new Types.ObjectId(resumeId) : undefined,
    platform,
    state: 'CREATED',
    approvedForExecution: false,
  });

  res.status(201).json({ success: true, data: execution });
});

// GET /api/automation/executions - List user's executions
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;

  const result = await repo.listByUserId(userId, { page, pageSize });
  res.json({ success: true, data: result });
});

// GET /api/automation/executions/:id - Get execution details
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  // Direct ownership check: find execution by ID, then verify user matches
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  res.json({ success: true, data: execution });
});

// POST /api/automation/executions/:id/inspect - Start inspection
router.post('/:id/inspect', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { applicationUrl } = req.body as { applicationUrl?: string };
  const execution = await repo.findByIdAndUserIdStrict(new Types.ObjectId(id), userId);

  if (!canTransitionState(execution.state, 'INSPECTING')) {
    throw new ValidationError(`Cannot inspect from ${execution.state} state`, { state: execution.state });
  }

  const url = applicationUrl ?? execution.applicationUrl;

  try {
    // Create a browser session for this execution
    await browserAutomationEngine.createSession(id, {}, { executionId: id, ownerId: userId.toString() });

    // Inspect the page using the engine
    const inspection = await browserAutomationEngine.inspectPage(id, url, {
      executionId: id,
      userId: userId.toString(),
    });

    // Store detected fields and mappings in the execution record
    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'INSPECTING',
      applicationUrl: url,
      detectedFields: inspection.form.fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        confidence: f.confidence,
      })),
      fieldMappings: inspection.mappings.map((m) => ({
        fieldId: m.fieldId,
        fieldLabel: m.fieldLabel,
        fieldType: m.fieldType,
        value: m.value,
        source: m.source,
        verified: m.verified,
        result: m.result,
        reason: m.reason,
      })),
      candidateInputRequired: inspection.needsCandidateInput.map((m) => ({
        fieldId: m.fieldId,
        fieldLabel: m.fieldLabel,
        fieldType: m.fieldType,
        value: m.value,
        source: m.source,
        verified: m.verified,
        result: m.result,
        reason: m.reason,
      })),
    });

    // Close the session after inspection (filling will create a new one)
    await browserAutomationEngine.closeSession(id);

    res.status(200).json({
      success: true,
      data: result,
      inspection: {
        form: inspection.form,
        mappings: inspection.mappings,
        needsCandidateInput: inspection.needsCandidateInput,
        readyForReview: inspection.readyForReview,
      },
    });
  } catch (err: any) {
    // Handle challenge detection:

    if (err?.challengeType || err?.message?.includes('Challenge detected')) {
      await repo.update(new Types.ObjectId(id), userId, {
        state: 'PAUSED',
        pauseReason: err?.reason || 'Challenge detected — manual intervention required',
        errorDetails: err?.message,
      });
      try {
        await browserAutomationEngine.closeSession(id);
      } catch {
        /* best-effort */
      }
      throw new ValidationError(err?.reason || 'Challenge detected — manual intervention required', {
        state: 'PAUSED',
        challengeType: err?.challengeType,
      });
    }

    // Fall back to recording intent if engine fails
    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'INSPECTING',
      applicationUrl: url,
    });
    res.json({ success: true, data: result });
  }
});

// POST /api/automation/executions/:id/pause - Pause an execution
router.post('/:id/pause', rateLimitAiGeneration, async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  // Direct ownership check
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  // Transition to PAUSED state
  const result = await BrowserAutomationExecutionModel.findByIdAndUpdate(
    new Types.ObjectId(id),
    {
      state: 'PAUSED',
      approvedForExecution: false,
      approvalFingerprint: undefined,
      pauseReason: req.body.challengeType ? `${req.body.challengeType} detected — manual solving required` : 'Challenge detected — manual solving required',
    },
    { new: true },
  ).lean();

  res.json({ success: true, data: result });
});

// POST /api/automation/executions/:id/fill - Execute filling
router.post('/:id/fill', rateLimitAiGeneration, validate(executionIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const execution = await repo.findByIdAndUserIdStrict(new Types.ObjectId(id), userId);

  if (!canTransitionState(execution.state, 'FILLING')) {
    throw new ValidationError(`Cannot fill from ${execution.state} state. Must be APPROVED_FOR_EXECUTION.`, { state: execution.state });
  }

  if (!execution.approvedForExecution) {
    throw new ValidationError('Execution must be approved before filling', { state: execution.state });
  }

  // Check approval freshness: recompute fingerprint and compare
  const currentFingerprint = await computeApprovalFingerprint(execution);
  if (execution.approvalFingerprint && execution.approvalFingerprint !== currentFingerprint) {
    // Stale approval — invalidate
    await repo.update(new Types.ObjectId(id), userId, {
      approvedForExecution: false,
      state: 'READY_FOR_REVIEW',
      approvalFingerprint: undefined,
    });
    throw new ValidationError('Approval is stale: execution data has changed since approval. Please review and re-approve.', {
      state: execution.state,
      staleApproval: true,
    });
  }

  // Get the application URL for the browser session
  const url = execution.applicationUrl;

  try {
    // Create a browser session for filling
    await browserAutomationEngine.createSession(id, {}, { executionId: id, ownerId: userId.toString() });

    // Prepare fields and mappings from the stored execution data
    const fields = (execution.detectedFields || []).map((f: any) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      currentValue: f.currentValue,
      locator: `[id="${f.id}"]`,
      confidence: f.confidence,
    }));

    const mappings = (execution.fieldMappings || []).map((m: any) => ({
      fieldId: m.fieldId,
      fieldLabel: m.fieldLabel,
      fieldType: m.fieldType,
      value: m.value,
      source: m.source,
      verified: m.verified,
      result: m.result,
      reason: m.reason,
    }));

    // Fill the form using the engine
    const fillSummary = await browserAutomationEngine.fillForm(
      id,
      fields,
      mappings,
      {
        resumeId: execution.selectedResumeId?.toString(),
        userId: userId.toString(),
      },
      { executionId: id, userId: userId.toString() },
    );

    // Store fill results and transition to FILLED
    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'FILLED',
      filledFields: fillSummary.results,
      skippedFields: fillSummary.results.filter((r) => r.status === 'SKIPPED'),
      failedFields: fillSummary.results.filter((r) => r.status === 'FAILED'),
    });

    res.json({
      success: true,
      data: result,
      fillSummary,
    });
  } catch (err: any) {
    // Handle challenge detection during filling
    if (err?.challengeType || err?.message?.includes('Challenge detected')) {
      await repo.update(new Types.ObjectId(id), userId, {
        state: 'PAUSED',
        pauseReason: err?.reason || 'Challenge detected during filling — manual intervention required',
        errorDetails: err?.message,
      });
      try {
        await browserAutomationEngine.closeSession(id);
      } catch {
        /* best-effort */
      }
      throw new ValidationError(err?.reason || 'Challenge detected during filling — manual intervention required', {
        state: 'PAUSED',
        challengeType: err?.challengeType,
      });
    }

    // Fall back to just transitioning state if engine fails
    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'FILLING',
    });
    res.json({ success: true, data: result });
  }
});

// POST /api/automation/executions/:id/resume - Resume from PAUSED
router.post('/:id/resume', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!Types.ObjectId.isValid(id)) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  // Direct ownership check
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  if (execution.state !== 'PAUSED') {
    throw new ValidationError(`Cannot resume from ${execution.state} state. Must be PAUSED.`, { state: execution.state });
  }

  // A client-supplied resolved flag is never treated as proof of resolution.
  // The explicit, authenticated call to this endpoint is the candidate's
  // intervention. The server forces re-inspection and invalidates approval.
  const result = await BrowserAutomationExecutionModel.updateOne(
    { _id: new Types.ObjectId(id), userId: userId },
    {
      state: 'INSPECTING',
      pauseReason: '',
    },
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  const updated = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  res.json({ success: true, data: updated });
});

// PATCH /api/automation/executions/:id/answers - Update candidate answers
router.patch('/:id/answers', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Direct ownership check
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  if (!canTransitionState(execution.state, 'AWAITING_CANDIDATE_INPUT')) {
    throw new ValidationError(`Cannot update answers from ${execution.state} state. Must be AWAITING_CANDIDATE_INPUT.`, { state: execution.state });
  }

  // In a real implementation, this would update the answers and re-validate.
  // For now, we record the intent.
  const result = await repo.update(new Types.ObjectId(id), userId, {
    state: 'READY_FOR_REVIEW',
  });

  res.json({ success: true, data: result });
});

// POST /api/automation/executions/:id/approve - Approve for execution
router.post('/:id/approve', rateLimitAiGeneration, validate(executionIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const execution = await repo.findByIdAndUserIdStrict(new Types.ObjectId(id), userId);

  if (!canTransitionState(execution.state, 'READY_FOR_REVIEW')) {
    throw new ValidationError(`Cannot approve from ${execution.state} state. Must be READY_FOR_REVIEW.`, { state: execution.state });
  }

  // Compute the fingerprint at approval time and store it.
  const fingerprint = await computeApprovalFingerprint(execution);

  // Transition to APPROVED_FOR_EXECUTION
  const result = await repo.update(new Types.ObjectId(id), userId, {
    state: 'APPROVED_FOR_EXECUTION',
    approvedForExecution: true,
    approvalFingerprint: fingerprint,
  });

  res.json({ success: true, data: result });
});

// POST /api/automation/executions/:id/review - Review and approve/reject execution
router.post('/:id/review', rateLimitAiGeneration, validate(executionIdParamSchema), async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { approved } = req.body as { approved?: boolean };

  const execution = await repo.findByIdAndUserIdStrict(new Types.ObjectId(id), userId);

  if (approved) {
    if (!canTransitionState(execution.state, 'READY_FOR_REVIEW')) {
      throw new ValidationError(`Cannot approve from ${execution.state} state. Must be READY_FOR_REVIEW.`, { state: execution.state });
    }

    // Compute the fingerprint at approval time and store it.
    const fingerprint = await computeApprovalFingerprint(execution);

    // Transition to APPROVED_FOR_EXECUTION
    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'APPROVED_FOR_EXECUTION',
      approvedForExecution: true,
      approvalFingerprint: fingerprint,
    });

    res.json({ success: true, data: result });
  } else {
    // Reject — go back to awaiting candidate input
    if (!canTransitionState(execution.state, 'AWAITING_CANDIDATE_INPUT')) {
      throw new ValidationError(`Cannot return to awaiting input from ${execution.state} state`, { state: execution.state });
    }

    const result = await repo.update(new Types.ObjectId(id), userId, {
      state: 'AWAITING_CANDIDATE_INPUT',
      approvedForExecution: false,
      approvalFingerprint: undefined,
    });

    res.json({ success: true, data: result });
  }
});

// POST /api/automation/executions/:id/cancel - Cancel an execution
router.post('/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Direct ownership check
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  // CANCELLED is allowed from CREATED and other states per VALID_TRANSITIONS
  if (!canTransitionState(execution.state, 'CANCELLED')) {
    throw new ValidationError(`Cannot cancel from ${execution.state} state.`, { state: execution.state });
  }

  // Transition to CANCELLED
  const result = await repo.update(new Types.ObjectId(id), userId, {
    state: 'CANCELLED',
    approvedForExecution: false,
    approvalFingerprint: undefined,
  });

  res.json({ success: true, data: result });
});

// GET /api/automation/executions/:id/evidence - Get execution evidence data
router.get('/:id/evidence', async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req);
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Direct ownership check
  const execution = await BrowserAutomationExecutionModel.findById(new Types.ObjectId(id));
  if (!execution) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }
  if (execution.userId.toString() !== userId.toString()) {
    throw new NotFoundError('BrowserAutomationExecution', id);
  }

  res.json({ success: true, data: { executionId: execution._id, state: execution.state } });
});

export default router;