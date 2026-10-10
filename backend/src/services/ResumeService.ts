/** Resume service: business logic for resume management and analysis. */

import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { ResumeAnalysisRepository } from '../repositories/ResumeAnalysisRepository.js';
import {
  getStorageProvider,
  providerForRecord,
  providerNameOf,
  resolveStorageTopology,
  saveWithFallback,
  isRetryableStorageError,
  type StorageProvider,
  type StorageTopology,
} from '../storage/index.js';
import { getConfig } from '../config/index.js';
import { getParserForMimeType } from '../resume/parser/index.js';
import { PARSER_VERSION, overallConfidenceFromEvidence, type StructuredParse } from '../resume/parser/structured.js';
import type { ResumeParser, SupportedMimeType } from '../resume/parser/ResumeParser.js';
import { InternalError, NotFoundError, ValidationError, ConflictError, AppError } from '../utils/errors.js';
import {
  getProfile,
  updateProfile,
} from './CandidateProfileService.js';

const resumeRepo = new ResumeRepository();
const analysisRepo = new ResumeAnalysisRepository();

const ALLOWED_MIME_TYPES: SupportedMimeType[] = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_RESUMES_PER_USER = 20;

/** Test seam: inject storage/repositories (defaults preserve production wiring). */
export interface ResumeServiceDeps {
  storage?: StorageProvider;
  /** Full resilient topology (primary + fallback). Overrides `storage` when set. */
  topology?: StorageTopology;
  resumes?: ResumeRepository;
  analyses?: ResumeAnalysisRepository;
}

async function resolveDeps(deps: ResumeServiceDeps = {}) {
  return {
    storage: deps.storage ?? (await getStorageProvider()),
    resumes: deps.resumes ?? resumeRepo,
    analyses: deps.analyses ?? analysisRepo,
  };
}

/** Resolve the resilient topology, honoring test seams. */
async function resolveTopology(deps: ResumeServiceDeps = {}): Promise<StorageTopology> {
  if (deps.topology) return deps.topology;
  if (deps.storage) {
    const name = providerNameOf(deps.storage);
    return {
      primary: deps.storage,
      primaryName: name,
      fallback: null,
      fallbackName: 'none',
      active: deps.storage,
      activeName: name,
      status: { active: name, primary: name, fallback: 'none', healthy: true, durable: true, degraded: false },
    };
  }
  return resolveStorageTopology();
}

/** Opaque, unpredictable object key. No user input beyond the validated extension. */
function buildStorageKey(userId: Types.ObjectId, originalFilename: string): { storageKey: string; storedFilename: string } {
  const ext = extensionOf(originalFilename).slice(1) || 'bin';
  const opaque = randomBytes(16).toString('hex');
  const storedFilename = `${opaque}.${ext}`;
  return { storageKey: `${userId.toString()}/${storedFilename}`, storedFilename };
}

/** Map transient storage outages to 503 (never a false 404). */
function toStorageUnavailableError(message = 'Resume storage is temporarily unavailable'): AppError {
  return new AppError('STORAGE_UNAVAILABLE', message, 503);
}

function maxFileSizeBytes(): number {
  return getConfig().MAX_RESUME_SIZE_MB * 1024 * 1024;
}

/** Magic bytes per format: PDF "%PDF-", DOCX is a ZIP ("PK\x03\x04"). */
function sniffMimeType(file: Buffer): SupportedMimeType | null {
  if (file.length >= 5 && file.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    file.length >= 4 &&
    file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

export interface UploadResumeResult {
  resume: {
    id: string;
    originalFilename: string;
    status: string;
    isDefault: boolean;
    createdAt: Date;
  };
  analysis: {
    id: string;
    status: string;
  } | null;
}

export interface ResumeListItem {
  id: string;
  originalFilename: string;
  status: string;
  fileSize: number;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * Upload a resume file. Validates content (never trusts client MIME alone),
 * stores through the resilient topology (Supabase with bounded retries and an
 * explicit durable fallback), and only then persists metadata. The actual
 * provider and object key are recorded on the resume; success is reported
 * only after both storage and required database writes succeed. Stored files
 * are removed again when database writes fail, so failed uploads leave no
 * orphans. No files migrate between providers during failover.
 */
export async function uploadResume(
  userId: Types.ObjectId,
  file: Buffer,
  originalFilename: string,
  mimeType: string,
  deps: ResumeServiceDeps = {},
): Promise<UploadResumeResult> {
  const { resumes, analyses } = await resolveDeps(deps);
  const topology = await resolveTopology(deps);

  // Validate file
  validateFile(originalFilename, mimeType, file);

  // Check if user already has max resumes (optional limit)
  const count = await resumes.countByUserId(userId);
  if (count >= MAX_RESUMES_PER_USER) {
    throw new ValidationError(`Maximum number of resumes (${MAX_RESUMES_PER_USER}) reached`);
  }

  // Generate an opaque, server-controlled storage key (no user input in the
  // key beyond a sanitized extension, so traversal is impossible).
  const { storageKey, storedFilename } = buildStorageKey(userId, originalFilename);

  // Store bytes. Ambiguous timeouts are resolved with an exists-check before
  // any fallback, so retries never duplicate and failover never orphans.
  // Throws without a false success when every provider is unavailable.
  let actualProvider: 'local' | 'supabase';
  try {
    const saved = await saveWithFallback(storageKey, file, mimeType, topology);
    actualProvider = saved.provider;
  } catch (err) {
    if (isRetryableStorageError(err)) throw toStorageUnavailableError();
    throw err;
  }
  const storedProvider = actualProvider!;

  let createdResumeId: Types.ObjectId | null = null;
  try {
    // Check if this should be the default resume
    const existingCount = await resumes.countByUserId(userId);
    const isDefault = existingCount === 0;

    // Create resume document (provider + key recorded together)
    const resume = await resumes.create({
      userId,
      originalFilename,
      storedFilename,
      mimeType,
      fileSize: file.length,
      storageKey,
      storageProvider: storedProvider,
      status: 'ready',
      version: 1,
      isDefault,
    });
    createdResumeId = resume._id;

    // Create analysis placeholder (required persistence: upload is not
    // successful until this exists too).
    let analysis;
    try {
      analysis = await analyses.create({
        resumeId: resume._id,
        userId,
        status: 'pending',
      });
    } catch (analysisErr) {
      await resumes.delete(resume._id, userId).catch(() => undefined);
      throw analysisErr;
    }

    return {
      resume: {
        id: resume._id.toString(),
        originalFilename: resume.originalFilename,
        status: resume.status,
        isDefault: resume.isDefault,
        createdAt: resume.createdAt,
      },
      analysis: {
        id: analysis._id.toString(),
        status: analysis.status,
      },
    };
  } catch (err) {
    // Database writes failed after the bytes landed: remove the orphan from
    // the provider that actually stored it (never touch the other backend).
    const candidates = [topology.active, topology.fallback].filter(
      (p): p is StorageProvider => Boolean(p),
    );
    const actual = candidates.find((p) => providerNameOf(p) === storedProvider) ?? topology.active;
    await actual.delete(storageKey).catch(() => undefined);
    if (createdResumeId) {
      await resumes.delete(createdResumeId, userId).catch(() => undefined);
    }
    throw err;
  }
}

/**
 * List user's resumes
 */
export async function listResumes(userId: Types.ObjectId): Promise<ResumeListItem[]> {
  const resumes = await resumeRepo.findByUserId(userId);
  return resumes.map(r => ({
    id: r._id.toString(),
    originalFilename: r.originalFilename,
    status: r.status,
    fileSize: r.fileSize,
    isDefault: r.isDefault,
    createdAt: r.createdAt,
  }));
}

/**
 * Get resume metadata by ID
 */
export async function getResume(userId: Types.ObjectId, resumeId: string) {
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  return {
    id: resume._id.toString(),
    originalFilename: resume.originalFilename,
    mimeType: resume.mimeType,
    fileSize: resume.fileSize,
    status: resume.status,
    version: resume.version,
    isDefault: resume.isDefault,
    storageProvider: (resume.storageProvider ?? 'local') as 'local' | 'supabase',
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

/**
 * Download resume file. Always uses the provider recorded for the resume;
 * never silently switches backends. Transient outages surface as 503, never
 * a false 404: 404 is returned only when the object is definitively absent.
 */
export async function downloadResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}) {
  const topology = await resolveTopology(deps);
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  let storage: StorageProvider;
  try {
    storage = providerForRecord(resume, topology);
  } catch (err) {
    if ((err as { code?: string }).code === 'STORAGE_PROVIDER_CONFLICT') {
      throw new ConflictError((err as Error).message);
    }
    throw err;
  }
  let stream: Awaited<ReturnType<StorageProvider['get']>>;
  try {
    stream = await storage.get(resume.storageKey);
  } catch (err) {
    if (isRetryableStorageError(err)) throw toStorageUnavailableError();
    throw err;
  }

  if (!stream) {
    // Confirm absence before reporting 404 so a transient outage cannot
    // masquerade as a missing file.
    try {
      const stillThere = await storage.exists(resume.storageKey);
      if (stillThere) throw toStorageUnavailableError();
    } catch (err) {
      if (err instanceof AppError && err.code === 'STORAGE_UNAVAILABLE') throw err;
      if (isRetryableStorageError(err)) throw toStorageUnavailableError();
      throw new NotFoundError('Resume file', resumeId);
    }
    throw new NotFoundError('Resume file', resumeId);
  }

  return {
    stream,
    filename: resume.originalFilename,
    contentType: resume.mimeType,
  };
}

/**
 * Delete resume. Uses the recorded provider only. A transient storage
 * outage aborts with 503 before any metadata is removed, so a retry can
 * still find and clean up the file.
 */
export async function deleteResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}): Promise<void> {
  const topology = await resolveTopology(deps);
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  let storage: StorageProvider;
  try {
    storage = providerForRecord(resume, topology);
  } catch (err) {
    if ((err as { code?: string }).code === 'STORAGE_PROVIDER_CONFLICT') {
      throw new ConflictError((err as Error).message);
    }
    throw err;
  }

  try {
    await storage.delete(resume.storageKey);
  } catch (err) {
    if (isRetryableStorageError(err)) throw toStorageUnavailableError();
    throw err;
  }

  // Delete analysis
  await analysisRepo.deleteByResumeId(resume._id, userId);

  // Delete resume document
  await resumeRepo.delete(resume._id, userId);
}

/**
 * Set resume as default
 */
export async function setDefaultResume(userId: Types.ObjectId, resumeId: string) {
  return resumeRepo.setDefault(resumeId, userId);
}

/**
 * Start/resume analysis. Parses the actual stored bytes from the recorded
 * provider — never an empty placeholder and never a substituted backend.
 * Failures mark the analysis failed with a warning and rethrow so callers
 * see a consistent error envelope. Transient storage outages surface as
 * 503, never a false "missing file".
 */
export async function analyzeResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}) {
  const topology = await resolveTopology(deps);
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  
  // Find or create analysis
  let analysis = await analysisRepo.findByResumeIdAndUserId(resume._id, userId);
  
  if (!analysis) {
    analysis = await analysisRepo.create({
      resumeId: resume._id,
      userId,
      status: 'processing',
    });
  } else if (analysis.status === 'completed' || analysis.status === 'processing') {
    // Reset for re-analysis
    const updated = await analysisRepo.update(resume._id, userId, {
      status: 'processing',
      extractedText: '',
      structuredData: {},
      warnings: [],
      confidence: 'uncertain',
    });
    if (updated) analysis = updated;
  } else {
    const updated = await analysisRepo.update(resume._id, userId, {
      status: 'processing',
    });
    if (updated) analysis = updated;
  }
  
  // At this point, analysis is guaranteed to be non-null
  const analysisId = analysis._id.toString();

  // Read the real stored bytes from the recorded provider (streamed into
  // memory; bounded by the upload limit). Parsers work purely in memory, so
  // there are no temporary parser files to clean up.
  let storage: StorageProvider;
  try {
    storage = providerForRecord(resume, topology);
  } catch (err) {
    if ((err as { code?: string }).code === 'STORAGE_PROVIDER_CONFLICT') {
      throw new ConflictError((err as Error).message);
    }
    throw err;
  }
  let fileStream: Awaited<ReturnType<StorageProvider['get']>>;
  try {
    fileStream = await storage.get(resume.storageKey);
  } catch (err) {
    if (isRetryableStorageError(err)) throw toStorageUnavailableError();
    throw err;
  }
  if (!fileStream) {
    let confirmedMissing = true;
    try {
      confirmedMissing = !(await storage.exists(resume.storageKey));
    } catch (err) {
      if (isRetryableStorageError(err)) throw toStorageUnavailableError();
    }
    if (!confirmedMissing) throw toStorageUnavailableError();
    await analysisRepo.update(resume._id, userId, {
      status: 'failed',
      warnings: [{
        field: 'general',
        message: 'Stored resume file is missing',
        severity: 'error',
      }],
    });
    throw new InternalError('Stored resume file is missing');
  }
  const file = await streamToBuffer(fileStream);

  // Perform analysis. Deterministic section-aware parsing only: no AI
  // provider is consulted here, so mock AI output can never be presented as
  // genuine analysis, and no qualifications, dates, or proficiency are
  // invented — everything reported carries resume evidence.
  try {
    const parser = getParserForMimeType(resume.mimeType as SupportedMimeType);
    const result = await parser.parse(file);
    const parsed = result.structuredData as unknown as StructuredParse;

    await analysisRepo.update(resume._id, userId, {
      status: 'completed',
      extractedText: result.extractedText,
      structuredData: result.structuredData,
      warnings: result.warnings,
      confidence: overallConfidenceFromEvidence(parsed),
      parserVersion: PARSER_VERSION,
    });

    return { success: true, analysisId };
  } catch (error) {
    await analysisRepo.update(resume._id, userId, {
      status: 'failed',
      warnings: [{
        field: 'general',
        message: error instanceof Error ? error.message : 'Analysis failed',
        severity: 'error',
      }],
    });
    // Unparseable user content is a client-data problem (422), not a server crash.
    throw new ValidationError('Resume content could not be analyzed', {
      reason: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
}

/**
 * Get analysis results
 */
export async function getAnalysis(userId: Types.ObjectId, resumeId: string) {
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  const analysis = await analysisRepo.findByResumeIdAndUserId(resume._id, userId);
  
  if (!analysis) {
    return null;
  }
  
  return {
    id: analysis._id.toString(),
    status: analysis.status,
    extractedText: analysis.extractedText,
    structuredData: analysis.structuredData,
    warnings: analysis.warnings,
    confidence: analysis.confidence,
    parserVersion: analysis.parserVersion,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
  };
}

/**
 * Retry failed analysis
 */
export async function retryAnalysis(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}) {
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  const analysis = await analysisRepo.findByResumeIdAndUserId(resume._id, userId);
  
  if (!analysis) {
    throw new NotFoundError('Analysis', resumeId);
  }
  
  if (analysis.status !== 'failed') {
    throw new ValidationError('Can only retry failed analysis');
  }

  return analyzeResume(userId, resumeId, deps);
}

/** Import modes: fill-only-empty (default, legacy) vs explicit selection. */
export type ImportMode = 'fill' | 'select' | 'review';

export interface ImportOptions {
  excludeSkills?: string[];
  includeReview?: string[];
  /** 'fill' preserves legacy behavior; 'select'/'review' apply only explicitly selected fields. */
  mode?: ImportMode;
  /** 'merge' adds skills (default); 'replace' swaps the whole list (destructive). */
  skillsMode?: 'merge' | 'replace';
  /** Existing profile skill names to remove (case-insensitive, destructive). */
  removeSkills?: string[];
  /** Concurrency preconditions: expected current values keyed by subkey path
   *  (`location.city`) or profile key (`phone`, `skills`). A mismatch aborts
   *  that target with a conflict instead of overwriting a concurrent edit. */
  expected?: Record<string, unknown>;
  /** Final user confirmation for destructive changes (overwrites, skills
   *  replace, skill removals). Without it, destructive targets conflict. */
  confirmReplace?: boolean;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
  conflicts: string[];
  /** Concrete subkey paths written (e.g. 'phone', 'location.city', 'skills'). */
  applied: string[];
  /** Existing skill names removed by replace/remove decisions. */
  removed: string[];
}

/** Group -> writable profile subkeys. Unknown groups are never written. */
const IMPORT_GROUPS: Record<string, string[]> = {
  personal: ['firstName', 'lastName', 'email', 'phone', 'location'],
  summary: ['professionalSummary'],
  skills: ['skills'],
  location: ['location', 'city', 'state', 'country'],
  contact: ['email', 'phone'],
  links: ['github', 'linkedin', 'portfolio', 'website', 'other'],
};

/** Max lengths from the profile Zod schema (updateProfileSchema). */
const MAX_LEN: Record<string, number> = {
  firstName: 100,
  lastName: 100,
  phone: 50,
  location: 200,
  city: 100,
  state: 100,
  country: 100,
  professionalSummary: 5000,
};

function resolveImportTargets(fields: string[]): { group: string; subkeys: string[] }[] {
  const byGroup = new Map<string, Set<string>>();
  for (const raw of fields) {
    const [group, sub] = String(raw).split('.');
    const allowed = IMPORT_GROUPS[group];
    if (!allowed) continue;
    if (!byGroup.has(group)) byGroup.set(group, new Set());
    if (sub && allowed.includes(sub)) {
      byGroup.get(group)!.add(sub);
    } else if (!sub) {
      for (const key of allowed) byGroup.get(group)!.add(key);
    }
  }
  return [...byGroup.entries()].map(([group, set]) => ({ group, subkeys: [...set] }));
}

function readProfilePath(profile: Record<string, unknown> | null, path: string): unknown {
  if (!profile) return undefined;
  if (path === 'professionalSummary') return profile.professionalSummary;
  if (path === 'skills') {
    const skills = (profile.skills ?? []) as Array<{ name?: unknown }>;
    return skills.map((s) => String(s?.name ?? '')).filter(Boolean);
  }
  if (path === 'other') {
    const links = (profile.socialLinks ?? {}) as Record<string, unknown>;
    return Array.isArray(links.other) ? links.other : [];
  }
  if (['github', 'linkedin', 'portfolio', 'website'].includes(path)) {
    return ((profile.socialLinks ?? {}) as Record<string, unknown>)[path];
  }
  return profile[path];
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const normList = (v: unknown): string[] =>
      (Array.isArray(v) ? v : [v]).map((x) => norm(x)).filter(Boolean).sort();
    const left = normList(a);
    const right = normList(b);
    return left.length === right.length && left.every((x, i) => x === right[i]);
  }
  return norm(a) === norm(b);
}

/** Reject malformed values before they can reach the database. */
function isAcceptableValue(path: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (path === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
  }
  const max = MAX_LEN[path];
  if (max !== undefined && trimmed.length > max) return false;
  return true;
}

function isAcceptableSkillName(name: unknown): boolean {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 100;
}

/**
 * Import extracted data into candidate profile.
 *
 * Modes:
 * - fill (default): legacy fill-only-empty; populated values are reported
 *   as conflicts, never overwritten. Unknown field names are skipped.
 * - select/review: only explicitly listed fields/subkeys are touched
 *   (e.g. 'summary', 'location.city'). Empty targets fill freely; populated
 *   targets that differ require `confirmReplace`, otherwise they conflict.
 *
 * All writes happen in a single atomic profile update, so a failed import
 * cannot leave partial changes. The analysis record and stored file are
 * never modified. The auth account email lives on the User record and is
 * never written here — only the profile contact email is importable.
 */
export async function importToProfile(
  userId: Types.ObjectId,
  resumeId: string,
  fields: string[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const analysis = await getAnalysis(userId, resumeId);

  if (!analysis || analysis.status !== 'completed') {
    throw new ValidationError('Analysis not completed');
  }

  const mode: ImportMode = opts.mode ?? 'fill';
  if (!['fill', 'select', 'review'].includes(mode)) {
    throw new ValidationError(`Unknown import mode: ${mode}`);
  }
  const skillsMode = opts.skillsMode ?? 'merge';
  if (!['merge', 'replace'].includes(skillsMode)) {
    throw new ValidationError(`Unknown skills mode: ${skillsMode}`);
  }
  const confirmed = opts.confirmReplace === true;
  const destructiveSkills = skillsMode === 'replace' || (opts.removeSkills ?? []).length > 0;

  const imported: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  const applied: string[] = [];
  const removed: string[] = [];
  const excludedSkills = new Set((opts.excludeSkills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const approvedReview = new Set((opts.includeReview ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const removalNames = new Set((opts.removeSkills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const expected = opts.expected ?? {};

  // Get current profile (fresh read: decisions and preconditions apply to
  // the latest state, so a concurrent edit is never silently overwritten).
  const existingProfileDoc = await getProfile(userId);
  const existingProfile = (existingProfileDoc ?? {}) as unknown as Record<string, unknown>;

  // Fill-only-empty import: never silently overwrite verified profile data.
  // Fields that already hold a different value are reported in `conflicts`
  // and left untouched; only empty fields are filled (`imported`).
  const isFilled = (value: unknown): boolean =>
    value !== undefined && value !== null && String(value).trim() !== '';

  const targets = resolveImportTargets(fields);
  const targetedGroups = new Set(targets.map((t) => t.group));
  // Unknown field names are reported, never written (legacy behavior).
  for (const raw of fields) {
    const group = String(raw).split('.')[0];
    if (!IMPORT_GROUPS[group]) skipped.push(String(raw));
  }

  /** Proposed scalar values per group, with legacy guards applied. */
  const propose = (group: string): { values: Record<string, string>; notes: string[] } => {
    const values: Record<string, string> = {};
    const notes: string[] = [];
    const personal = analysis.structuredData.personal as Record<string, string | undefined> | undefined;
    if (group === 'personal' && analysis.structuredData.personal) {
      const nameParts = (personal?.name ?? '').split(' ').filter(Boolean);
      Object.assign(values, {
        ...(nameParts[0] ? { firstName: nameParts[0] } : {}),
        ...(nameParts.slice(1).join(' ') ? { lastName: nameParts.slice(1).join(' ') } : {}),
        ...(personal?.email ? { email: personal.email } : {}),
        ...(personal?.phone ? { phone: personal.phone } : {}),
        ...(personal?.location ? { location: personal.location } : {}),
      });
    } else if (group === 'summary' && analysis.structuredData.summary) {
      // Placeholder filler is never imported, even from older analyses.
      if (/\blorem\s+ipsum\b/i.test(analysis.structuredData.summary)) {
        notes.push('summary (placeholder text)');
      } else {
        values.professionalSummary = analysis.structuredData.summary as string;
      }
    } else if (group === 'location' && personal) {
      const candidates: Record<string, string | undefined> = {
        location: personal.location,
        city: personal.city,
        state: personal.state,
        country: personal.country,
      };
      // Template addresses are never imported, even from older analyses.
      if (Object.values(candidates).some((v) => v && /123\s+anywhere|any\s+city|\bST\s+12345\b/i.test(v))) {
        notes.push('location (placeholder address)');
      } else {
        for (const [key, value] of Object.entries(candidates)) {
          if (isFilled(value)) values[key] = value as string;
        }
      }
    } else if (group === 'contact' && personal) {
      // Profile email/phone only (application contact details). The auth
      // account email is a separate identity and is never touched here.
      if (isFilled(personal.email)) values.email = personal.email as string;
      if (isFilled(personal.phone)) values.phone = personal.phone as string;
    } else if (group === 'links' && analysis.structuredData.links) {
      const links = analysis.structuredData.links as Record<string, unknown>;
      const singles: Record<string, string | undefined> = {
        github: asHttpUrl(links.github),
        linkedin: asHttpUrl(links.linkedin),
        portfolio: asHttpUrl(links.portfolio),
        website: asHttpUrl(links.website),
      };
      for (const [key, value] of Object.entries(singles)) {
        if (value) values[key] = value;
      }
    }
    return { values, notes };
  };

  // Scalar patch assembled for ONE atomic update (no partial writes).
  const scalarPatch: Record<string, unknown> = {};
  let socialLinksPatch: Record<string, unknown> | null = null;

  const checkExpected = (group: string, subkey: string, profileKey: string, label: string): boolean => {
    const candidates = [`${group}.${subkey}`, profileKey];
    const key = candidates.find((k) => k in expected);
    if (key === undefined) return true;
    const current = readProfilePath(existingProfile, profileKey);
    if (!valuesEqual(current, expected[key])) {
      conflicts.push(`${label} changed since review; re-review before applying`);
      return false;
    }
    return true;
  };

  /** Decide one scalar subkey: returns 'applied' | 'conflict' | 'skipped' | 'invalid'. */
  const decideScalar = (
    group: string,
    subkey: string,
    proposed: string | undefined,
    profileKey: string,
  ): 'applied' | 'conflict' | 'skipped' | 'invalid' => {
    const label = `${group} (${subkey})`;
    const appliedPath = `${group}.${subkey}`;
    if (proposed === undefined) return 'skipped';
    if (!isAcceptableValue(subkey === 'professionalSummary' ? 'professionalSummary' : subkey, proposed)) {
      skipped.push(`${label} (invalid value)`);
      return 'invalid';
    }
    const current = readProfilePath(existingProfile, profileKey);
    if (!isFilled(current)) {
      scalarPatch[profileKey] = proposed.trim();
      applied.push(appliedPath);
      return 'applied';
    }
    if (valuesEqual(current, proposed)) return 'skipped';
    // Populated and different: fill mode conflicts; select/review applies
    // only with explicit final confirmation.
    if (mode === 'fill' || !confirmed) {
      conflicts.push(
        mode === 'fill'
          ? group === 'summary'
            ? 'summary (already set)'
            : `${group} (already set: ${subkey})`
          : `${label} (already set; replace not confirmed)`,
      );
      return 'conflict';
    }
    if (!checkExpected(group, subkey, profileKey, label)) return 'conflict';
    scalarPatch[profileKey] = proposed.trim();
    applied.push(appliedPath);
    return 'applied';
  };

  const groupTouched: Record<string, boolean> = {};
  const groupConflicted: Record<string, boolean> = {};

  for (const { group, subkeys } of targets) {
    try {
      if (group === 'skills') continue; // handled below (single code path)
      if (group === 'links') {
        const { values } = propose('links');
        const currentLinks = (existingProfile.socialLinks ?? {}) as Record<string, unknown>;
        const nextLinks: Record<string, unknown> = { ...(currentLinks as Record<string, unknown>) };
        let wrote = false;
        for (const subkey of subkeys) {
          if (subkey === 'other') {
            const extra = Array.isArray(analysis.structuredData.links?.other)
              ? ((analysis.structuredData.links?.other ?? []) as unknown[]).map(asHttpUrl).filter((u): u is string => Boolean(u))
              : [];
            const currentOther = Array.isArray(currentLinks.other) ? (currentLinks.other as string[]) : [];
            const fresh = extra.filter((u) => !currentOther.some((c) => norm(c) === norm(u)));
            if (fresh.length === 0) continue;
            if (!checkExpected('links', 'other', 'other', 'links (other)')) {
              groupConflicted.links = true;
              continue;
            }
            nextLinks.other = [...currentOther, ...fresh];
            wrote = true;
            applied.push('links.other');
            continue;
          }
          const proposed = values[subkey];
          if (proposed === undefined) continue;
          const current = currentLinks[subkey];
          if (!isFilled(current)) {
            nextLinks[subkey] = proposed;
            wrote = true;
            applied.push(`links.${subkey}`);
            continue;
          }
          if (valuesEqual(current, proposed)) continue;
          if (mode === 'fill' || !confirmed) {
            conflicts.push(
              mode === 'fill' ? `links (already set: ${subkey})` : `links (${subkey}) (already set; replace not confirmed)`,
            );
            groupConflicted.links = true;
            continue;
          }
          if (!checkExpected('links', subkey, subkey, `links (${subkey})`)) {
            groupConflicted.links = true;
            continue;
          }
          nextLinks[subkey] = proposed;
          wrote = true;
          applied.push(`links.${subkey}`);
        }
        if (wrote) {
          socialLinksPatch = nextLinks;
          groupTouched.links = true;
        } else if (!groupConflicted.links) {
          skipped.push('links');
        }
        continue;
      }
      // Scalar groups: personal, summary, location, contact.
      const { values, notes } = propose(group);
      for (const note of notes) skipped.push(note);
      const profileKeyFor = (subkey: string): string =>
        group === 'summary' ? 'professionalSummary' : subkey;
      let wrote = false;
      let conflicted = false;
      for (const subkey of subkeys) {
        const proposed = values[subkey];
        if (proposed === undefined) continue;
        const outcome = decideScalar(group, subkey, proposed, profileKeyFor(subkey));
        if (outcome === 'applied') wrote = true;
        if (outcome === 'conflict') conflicted = true;
      }
      if (wrote) groupTouched[group] = true;
      if (conflicted) groupConflicted[group] = true;
      if (!wrote && !conflicted && notes.length === 0) skipped.push(group);
    } catch (error) {
      conflicts.push(group);
    }
  }

  // ---- Skills (merge / replace / individual review) ----
  if (targetedGroups.has('skills')) {
    try {
      const courseworkCount = (analysis.structuredData.skills ?? []).filter(
        (s) => s.category === 'coursework',
      ).length;
      const verified = (analysis.structuredData.skills ?? []).filter(
        (s) =>
          (s.reviewStatus ?? 'verified') === 'verified' &&
          s.category !== 'coursework' &&
          !excludedSkills.has(s.name.trim().toLowerCase()),
      );
      const approvedTerms = (analysis.structuredData.reviewCandidates ?? [])
        .map((r) => r.text)
        .filter((t) => approvedReview.has(t.trim().toLowerCase()));
      const existingSkills = ((existingProfile.skills ?? []) as Array<{ _id?: unknown; name?: unknown; category?: unknown }>);
      const existingByName = new Map(
        existingSkills.map((s) => [String(s?.name ?? '').toLowerCase(), s]),
      );

      const toAdd: Array<{ name: string; category?: string }> = [];
      if (skillsMode === 'merge' || approvedTerms.length > 0) {
        for (const s of verified) {
          if (!existingByName.has(s.name.toLowerCase())) {
            toAdd.push({ name: s.name.trim(), ...(s.category ? { category: s.category } : {}) });
          }
        }
        for (const name of approvedTerms) {
          const trimmed = name.trim();
          if (trimmed && !existingByName.has(trimmed.toLowerCase()) && !toAdd.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
            toAdd.push({ name: trimmed });
          }
        }
      }

      // Validate candidate skill names before they can reach the database.
      const validAdd = toAdd.filter((s) => {
        if (!isAcceptableSkillName(s.name)) {
          skipped.push(`skills (${s.name.slice(0, 40)}: invalid name)`);
          return false;
        }
        return true;
      });

      let finalSkills: Array<Record<string, unknown>> | null = null;
      if (skillsMode === 'replace') {
        if (!confirmed) {
          conflicts.push('skills (replace not confirmed)');
        } else {
          if (!checkExpected('skills', 'skills', 'skills', 'skills')) {
            groupConflicted.skills = true;
          } else {
            const wanted = new Map<string, { name: string; category?: string }>();
            for (const s of verified) {
              const key = s.name.toLowerCase();
              if (!wanted.has(key)) wanted.set(key, { name: s.name.trim(), ...(s.category ? { category: s.category } : {}) });
            }
            for (const name of approvedTerms) {
              const key = name.trim().toLowerCase();
              if (key && !wanted.has(key)) wanted.set(key, { name: name.trim() });
            }
            finalSkills = [...wanted.values()].map((s) => ({ ...s }));
            for (const existing of existingSkills) {
              const key = String(existing?.name ?? '').toLowerCase();
              if (key && ![...wanted.keys()].includes(key)) {
                removed.push(String(existing?.name ?? key));
              }
            }
            groupTouched.skills = true;
          }
        }
      } else if (validAdd.length > 0) {
        finalSkills = [
          ...existingSkills.map((s) => ({ ...(s as unknown as Record<string, unknown>) })),
          ...validAdd.map((s) => ({ ...s })),
        ];
        groupTouched.skills = true;
      }

      // Individual removals (explicit per-skill review decisions).
      const removalHits = [...removalNames].filter((n) =>
        existingSkills.some((s) => String(s?.name ?? '').toLowerCase() === n),
      );
      if (removalHits.length > 0) {
        if (!confirmed) {
          conflicts.push(`skills (removal not confirmed: ${removalHits.join(', ')})`);
        } else {
          const drop = new Set(removalHits);
          const base = finalSkills ?? existingSkills.map((s) => ({ ...(s as unknown as Record<string, unknown>) }));
          const before = base.length;
          finalSkills = base.filter((s) => !drop.has(String((s as Record<string, unknown>).name ?? '').toLowerCase()));
          for (const s of base) {
            const name = String((s as Record<string, unknown>).name ?? '');
            if (drop.has(name.toLowerCase()) && !removed.includes(name)) removed.push(name);
          }
          if (finalSkills.length !== before) groupTouched.skills = true;
        }
      }

      if (finalSkills) {
        scalarPatch.skills = finalSkills;
        applied.push('skills');
      }
      if (!groupTouched.skills && !groupConflicted.skills) {
        // Legacy semantic: 'skills' counts as imported when candidates
        // existed, even if every one was already present (re-import).
        if (verified.length + approvedTerms.length > 0) {
          imported.push('skills');
        } else {
          skipped.push('skills');
        }
      }
      const notes: string[] = [];
      if (courseworkCount > 0) notes.push(`${courseworkCount} coursework not auto-imported`);
      const rejectedCount =
        (analysis.structuredData.skills ?? []).length -
        verified.length -
        courseworkCount;
      if (rejectedCount > 0) notes.push(`${rejectedCount} rejected in review`);
      if (notes.length > 0) skipped.push(`skills (${notes.join('; ')})`);
    } catch (error) {
      conflicts.push('skills');
    }
  }

  if (groupTouched.skills && !imported.includes('skills')) imported.push('skills');
  for (const [group] of Object.entries(groupTouched)) {
    if (group !== 'skills' && !imported.includes(group)) imported.push(group);
  }

  // Nothing to write: report without touching the database.
  const hasWrites = Object.keys(scalarPatch).length > 0 || socialLinksPatch !== null;
  if (!hasWrites) {
    return { imported, skipped, conflicts, applied: [...new Set(applied)], removed };
  }

  // ONE atomic profile update: all-or-nothing, so a failure cannot leave
  // partial changes. runValidators backs the pre-checks server-side.
  const patch: Record<string, unknown> = { ...scalarPatch };
  if (socialLinksPatch !== null) patch.socialLinks = socialLinksPatch;
  try {
    await updateProfile(userId, patch as Parameters<typeof updateProfile>[1]);
  } catch (error) {
    // Write failed after validation: nothing was applied (single update).
    // Mirror legacy behavior by reporting targeted groups as conflicts.
    for (const group of new Set([...Object.keys(groupTouched), ...targets.map((t) => t.group)])) {
      if (!conflicts.some((c) => c === group || c.startsWith(`${group} `) || c.startsWith(`${group} (`))) {
        conflicts.push(group);
      }
    }
    return { imported: imported.filter((g) => !groupTouched[g]), skipped, conflicts, applied: [], removed: [] };
  }
  return { imported, skipped, conflicts, applied: [...new Set(applied)], removed };
}

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Re-validate a stored link before writing it to a profile: http(s) only. */
function asHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function validateFile(filename: string, mimeType: string, file: Buffer): void {
  if (!filename || filename.length > 255) {
    throw new ValidationError('Invalid filename');
  }

  // Check for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new ValidationError('Invalid filename');
  }

  const extension = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new ValidationError('File type not allowed. Supported: PDF (.pdf), DOCX (.docx)');
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType as SupportedMimeType)) {
    throw new ValidationError('File type not allowed. Supported: PDF, DOCX');
  }

  // Never trust the client MIME type alone: content must match its container.
  const sniffed = sniffMimeType(file);
  if (!sniffed) {
    throw new ValidationError('File content is not a recognizable PDF or DOCX document');
  }
  const sniffedExtension = sniffed === 'application/pdf' ? '.pdf' : '.docx';
  if (extension !== sniffedExtension) {
    throw new ValidationError(`File extension (${extension}) does not match file content (${sniffedExtension})`);
  }

  const maxBytes = maxFileSizeBytes();
  if (file.length === 0) {
    throw new ValidationError('File is empty');
  }
  if (file.length > maxBytes) {
    throw new ValidationError(`File size exceeds ${maxBytes / 1024 / 1024}MB limit`);
  }
}

/** Collect a readable stream into a Buffer (bounded by the upload size limit). */
function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}