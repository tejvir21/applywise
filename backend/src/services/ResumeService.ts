/** Resume service: business logic for resume management and analysis. */

import { Types } from 'mongoose';
import { ResumeRepository } from '../repositories/ResumeRepository.js';
import { ResumeAnalysisRepository } from '../repositories/ResumeAnalysisRepository.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { getConfig } from '../config/index.js';
import { getParserForMimeType } from '../resume/parser/index.js';
import type { ResumeParser, SupportedMimeType } from '../resume/parser/ResumeParser.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import {
  getProfile,
  updateProfile,
  addSkill,
} from './CandidateProfileService.js';

const resumeRepo = new ResumeRepository();
const analysisRepo = new ResumeAnalysisRepository();
const storage = new LocalStorageProvider();

const ALLOWED_MIME_TYPES: SupportedMimeType[] = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = getConfig().MAX_RESUME_SIZE_MB * 1024 * 1024; // Convert MB to bytes

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
 * Upload a resume file
 */
export async function uploadResume(
  userId: Types.ObjectId,
  file: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<UploadResumeResult> {
  // Validate file
  validateFile(originalFilename, mimeType, file.length);

  // Check if user already has max resumes (optional limit)
  const count = await resumeRepo.countByUserId(userId);
  if (count >= 20) {
    throw new ValidationError('Maximum number of resumes (20) reached');
  }

  // Generate storage key
  const resumeId = new Types.ObjectId();
  const storedFilename = `${resumeId.toString()}.${getExtension(originalFilename)}`;
  const storageKey = `${userId.toString()}/${storedFilename}`;

  // Store file
  await storage.save(storageKey, file, mimeType);

  // Check if this should be the default resume
  const existingCount = await resumeRepo.countByUserId(userId);
  const isDefault = existingCount === 0;

  // Create resume document
  const resume = await resumeRepo.create({
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
  const analysis = await analysisRepo.create({
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
export async function downloadResume(userId: Types.ObjectId, resumeId: string) {
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
export async function deleteResume(userId: Types.ObjectId, resumeId: string): Promise<void> {
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
 * Start/resume analysis
 */
export async function analyzeResume(userId: Types.ObjectId, resumeId: string) {
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
    const updated = await analysisRepo.update(analysis._id.toString(), userId, {
      status: 'processing',
      extractedText: '',
      structuredData: {},
      warnings: [],
      confidence: 'uncertain',
    });
    if (updated) analysis = updated;
  } else {
    const updated = await analysisRepo.update(analysis._id.toString(), userId, {
      status: 'processing',
    });
    if (updated) analysis = updated;
  }
  
  // At this point, analysis is guaranteed to be non-null
  const analysisId = analysis._id.toString();
  
  // Perform analysis
  try {
    const parser = getParserForMimeType(resume.mimeType as SupportedMimeType);
    const result = await parser.parse(Buffer.from('')); // TODO: Get actual file from storage
    
    await analysisRepo.update(analysisId, userId, {
      status: 'completed',
      extractedText: result.extractedText,
      structuredData: result.structuredData,
      warnings: result.warnings,
      confidence: calculateOverallConfidence(result.structuredData),
    });
    
    return { success: true, analysisId };
  } catch (error) {
    await analysisRepo.update(analysisId, userId, {
      status: 'failed',
      warnings: [{
        field: 'general',
        message: error instanceof Error ? error.message : 'Analysis failed',
        severity: 'error',
      }],
    });
    throw error;
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
  
  for (const field of fields) {
    try {
      switch (field) {
        case 'personal':
          if (analysis.structuredData.personal) {
            await updateProfile(userId, {
              firstName: analysis.structuredData.personal.name?.split(' ')[0],
              lastName: analysis.structuredData.personal.name?.split(' ').slice(1).join(' '),
              email: analysis.structuredData.personal.email,
              phone: analysis.structuredData.personal.phone,
              location: analysis.structuredData.personal.location,
            });
            imported.push('personal');
          }
          break;
        case 'summary':
          if (analysis.structuredData.summary) {
            await updateProfile(userId, {
              professionalSummary: analysis.structuredData.summary,
            });
            imported.push('summary');
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

function validateFile(filename: string, mimeType: string, size: number): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    throw new ValidationError(`File type not allowed. Supported: PDF, DOCX`);
  }
  
  if (size > MAX_FILE_SIZE) {
    throw new ValidationError(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }
  
  if (!filename || filename.length > 255) {
    throw new ValidationError('Invalid filename');
  }
  
  // Check for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new ValidationError('Invalid filename');
  }
}

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || 'pdf';
}

function calculateOverallConfidence(structuredData: Record<string, unknown>): string {
  // Simple heuristic: if we extracted meaningful data, confidence is medium
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