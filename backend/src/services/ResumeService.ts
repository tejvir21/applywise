/** Resume service: business logic for resume management and analysis. */

import { Types } from 'mongoose';
import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { ResumeAnalysisRepository } from '../repositories/ResumeAnalysisRepository.js';
import { getStorageProvider, type StorageProvider } from '../storage/index.js';
import { getConfig } from '../config/index.js';
import { getParserForMimeType } from '../resume/parser/index.js';
import type { ResumeParser, SupportedMimeType } from '../resume/parser/ResumeParser.js';
import { InternalError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import {
  getProfile,
  updateProfile,
  addSkill,
} from './CandidateProfileService.js';

const resumeRepo = new ResumeRepository();
const analysisRepo = new ResumeAnalysisRepository();

const ALLOWED_MIME_TYPES: SupportedMimeType[] = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_RESUMES_PER_USER = 20;

/** Test seam: inject storage/repositories (defaults preserve production wiring). */
export interface ResumeServiceDeps {
  storage?: StorageProvider;
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
 * stores through the configured provider, and only then persists metadata.
 * A stored file is deleted again if database writes fail, so failed uploads
 * leave no orphans.
 */
export async function uploadResume(
  userId: Types.ObjectId,
  file: Buffer,
  originalFilename: string,
  mimeType: string,
  deps: ResumeServiceDeps = {},
): Promise<UploadResumeResult> {
  const { storage, resumes, analyses } = await resolveDeps(deps);

  // Validate file
  validateFile(originalFilename, mimeType, file);

  // Check if user already has max resumes (optional limit)
  const count = await resumes.countByUserId(userId);
  if (count >= MAX_RESUMES_PER_USER) {
    throw new ValidationError(`Maximum number of resumes (${MAX_RESUMES_PER_USER}) reached`);
  }

  // Generate storage key (server-controlled path: no user input in the key
  // beyond a sanitized extension, so traversal is impossible)
  const resumeId = new Types.ObjectId();
  const storedFilename = `${resumeId.toString()}.${extensionOf(originalFilename).slice(1) || 'bin'}`;
  const storageKey = `${userId.toString()}/${storedFilename}`;

  // Store file
  await storage.save(storageKey, file, mimeType);

  try {
    // Check if this should be the default resume
    const existingCount = await resumes.countByUserId(userId);
    const isDefault = existingCount === 0;

    // Create resume document
    const resume = await resumes.create({
      userId,
      originalFilename,
      storedFilename,
      mimeType,
      fileSize: file.length,
      storageKey,
      status: 'ready',
      version: 1,
      isDefault,
    });

    // Create analysis placeholder
    const analysis = await analyses.create({
      resumeId: resume._id,
      userId,
      status: 'pending',
    });

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
    // Database write failed after the file landed: remove the orphan.
    await storage.delete(storageKey).catch(() => undefined);
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
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

/**
 * Download resume file
 */
export async function downloadResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}) {
  const { storage } = await resolveDeps(deps);
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  const stream = await storage.get(resume.storageKey);
  
  if (!stream) {
    throw new NotFoundError('Resume file', resume.storageKey);
  }
  
  return {
    stream,
    filename: resume.originalFilename,
    contentType: resume.mimeType,
  };
}

/**
 * Delete resume
 */
export async function deleteResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}): Promise<void> {
  const { storage } = await resolveDeps(deps);
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);

  // Delete file
  await storage.delete(resume.storageKey);

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
 * Start/resume analysis. Parses the actual stored file bytes — never an
 * empty placeholder. Failures mark the analysis failed with a warning and
 * rethrow so callers see a consistent error envelope.
 */
export async function analyzeResume(userId: Types.ObjectId, resumeId: string, deps: ResumeServiceDeps = {}) {
  const { storage } = await resolveDeps(deps);
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

  // Read the real stored bytes (streamed into memory; bounded by the upload limit)
  const fileStream = await storage.get(resume.storageKey);
  if (!fileStream) {
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

  // Perform analysis
  try {
    const parser = getParserForMimeType(resume.mimeType as SupportedMimeType);
    const result = await parser.parse(file);

    await analysisRepo.update(resume._id, userId, {
      status: 'completed',
      extractedText: result.extractedText,
      structuredData: result.structuredData,
      warnings: result.warnings,
      confidence: calculateOverallConfidence(result.structuredData),
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
export async function retryAnalysis(userId: Types.ObjectId, resumeId: string) {
  const resume = await resumeRepo.findByIdAndUserIdOrThrow(resumeId, userId);
  const analysis = await analysisRepo.findByResumeIdAndUserId(resume._id, userId);
  
  if (!analysis) {
    throw new NotFoundError('Analysis', resumeId);
  }
  
  if (analysis.status !== 'failed') {
    throw new ValidationError('Can only retry failed analysis');
  }
  
  return analyzeResume(userId, resumeId);
}

/**
 * Import extracted data into candidate profile
 */
export async function importToProfile(
  userId: Types.ObjectId,
  resumeId: string,
  fields: string[]
): Promise<{ imported: string[]; skipped: string[]; conflicts: string[] }> {
  const analysis = await getAnalysis(userId, resumeId);
  
  if (!analysis || analysis.status !== 'completed') {
    throw new ValidationError('Analysis not completed');
  }
  
  const imported: string[] = [];
  const skipped: string[] = [];
  const conflicts: string[] = [];
  
  // Get current profile
  const existingProfile = await getProfile(userId);

  // Fill-only-empty import: never silently overwrite verified profile data.
  // Fields that already hold a different value are reported in `conflicts`
  // and left untouched; only empty fields are filled (`imported`).
  const isFilled = (value: unknown): boolean =>
    value !== undefined && value !== null && String(value).trim() !== '';

  for (const field of fields) {
    try {
      switch (field) {
        case 'personal':
          if (analysis.structuredData.personal) {
            const personal = analysis.structuredData.personal as Record<string, string | undefined>;
            const nameParts = (personal.name ?? '').split(' ').filter(Boolean);
            const candidates: Record<string, string | undefined> = {
              firstName: nameParts[0],
              lastName: nameParts.slice(1).join(' ') || undefined,
              email: personal.email,
              phone: personal.phone,
              location: personal.location,
            };
            const patch: Record<string, string> = {};
            const contested: string[] = [];
            for (const [key, value] of Object.entries(candidates)) {
              if (!isFilled(value)) continue;
              const current = (existingProfile as Record<string, unknown> | null)?.[key];
              if (!isFilled(current)) {
                patch[key] = value as string;
              } else if (norm(current) !== norm(value)) {
                contested.push(key);
              }
            }
            if (Object.keys(patch).length > 0) {
              await updateProfile(userId, patch);
              imported.push('personal');
            }
            if (contested.length > 0) {
              conflicts.push(`personal (already set: ${contested.join(', ')})`);
            } else if (Object.keys(patch).length === 0) {
              skipped.push(field);
            }
          } else {
            skipped.push(field);
          }
          break;
        case 'summary':
          if (analysis.structuredData.summary) {
            const current = existingProfile?.professionalSummary;
            if (!isFilled(current)) {
              await updateProfile(userId, {
                professionalSummary: analysis.structuredData.summary as string,
              });
              imported.push('summary');
            } else if (norm(current) !== norm(analysis.structuredData.summary)) {
              conflicts.push('summary (already set)');
            } else {
              skipped.push(field);
            }
          } else {
            skipped.push(field);
          }
          break;
        case 'skills':
          if (analysis.structuredData.skills?.length) {
            // For skills, we add new ones without removing existing
            const existingProfile = await getProfile(userId);
            const existingSkillNames = new Set(existingProfile?.skills?.map((s: any) => s.name.toLowerCase()) || []);
            
            for (const skill of analysis.structuredData.skills) {
              if (!existingSkillNames.has(skill.name.toLowerCase())) {
                await addSkill(userId, {
                  name: skill.name,
                  level: skill.confidence === 'high' ? 'advanced' : 'intermediate',
                });
              }
            }
            imported.push('skills');
          }
          break;
        // Add more field handlers as needed
        default:
          skipped.push(field);
      }
    } catch (error) {
      conflicts.push(field);
    }
  }
  
  return { imported, skipped, conflicts };
}

function norm(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
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

function calculateOverallConfidence(structuredData: Record<string, unknown>): string {
  const hasPersonal = structuredData.personal && Object.keys(structuredData.personal).length > 0;
  const hasSkills = Array.isArray(structuredData.skills) && structuredData.skills.length > 0;
  const hasExperience = Array.isArray(structuredData.experience) && structuredData.experience.length > 0;
  const hasEducation = Array.isArray(structuredData.education) && structuredData.education.length > 0;
  
  const score = [hasPersonal, hasSkills, hasExperience, hasEducation].filter(Boolean).length;
  
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  if (score >= 1) return 'low';
  return 'uncertain';
}