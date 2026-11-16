/**
 * Candidate Field Mapper (Phase 9.0).
 *
 * Maps verified candidate profile data to extracted form fields.
 * Only uses verified candidate information — never invents facts.
 */

import type { ExtractedField } from './FormFieldExtractor.js';

export type MappingResult = 'MAPPED' | 'UNMAPPED' | 'NEEDS_CANDIDATE_INPUT' | 'UNSUPPORTED';

export interface FieldMapping {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  value: string | null;
  source: string | null;
  verified: boolean;
  result: MappingResult;
  reason?: string;
}

export interface CandidateData {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
  professionalSummary?: string;
  yearsOfExperience?: number;
  currentJobTitle?: string;
  currentCompany?: string;
  skills?: string[];
  resumeStorageKey?: string;
  resumeFilename?: string;
  resumeMimeType?: string;
}

export class CandidateFieldMapper {
  mapFields(fields: ExtractedField[], candidate: CandidateData): FieldMapping[] {
    return fields.map((field) => this.mapField(field, candidate));
  }

  private mapField(field: ExtractedField, candidate: CandidateData): FieldMapping {
    const label = field.label.toLowerCase();
    const id = field.id.toLowerCase();

    // Full name
    if (this.matchesField(label, id, ['name', 'full name', 'fullname', 'first name', 'applicant name'])) {
      const name = candidate.displayName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
      if (name) {
        return this.mapped(field, name, 'profile.displayName', true);
      }
      return this.needsInput(field, 'Candidate name not available in profile');
    }

    // Email
    if (this.matchesField(label, id, ['email', 'e-mail', 'email address'])) {
      if (candidate.email) {
        return this.mapped(field, candidate.email, 'profile.email', true);
      }
      return this.needsInput(field, 'Email not available in profile');
    }

    // Phone
    if (this.matchesField(label, id, ['phone', 'telephone', 'mobile', 'contact number', 'phone number'])) {
      if (candidate.phone) {
        return this.mapped(field, candidate.phone, 'profile.phone', true);
      }
      return this.needsInput(field, 'Phone not available in profile');
    }

    // Location
    if (this.matchesField(label, id, ['location', 'city', 'address', 'current location'])) {
      if (candidate.location) {
        return this.mapped(field, candidate.location, 'profile.location', true);
      }
      return this.needsInput(field, 'Location not available in profile');
    }

    // Headline / current title
    if (this.matchesField(label, id, ['headline', 'current title', 'job title', 'current position', 'current role'])) {
      if (candidate.currentJobTitle || candidate.headline) {
        return this.mapped(field, candidate.currentJobTitle || candidate.headline || '', 'profile.currentJobTitle', true);
      }
      return this.needsInput(field, 'Current job title not available in profile');
    }

    // Skills
    if (this.matchesField(label, id, ['skills', 'key skills', 'technical skills', 'core skills'])) {
      if (candidate.skills && candidate.skills.length > 0) {
        return this.mapped(field, candidate.skills.join(', '), 'profile.skills', true);
      }
      return this.needsInput(field, 'Skills not available in profile');
    }

    // Years of experience
    if (this.matchesField(label, id, ['years of experience', 'experience years', 'total experience'])) {
      if (candidate.yearsOfExperience != null) {
        return this.mapped(field, String(candidate.yearsOfExperience), 'profile.yearsOfExperience', true);
      }
      return this.needsInput(field, 'Years of experience not available in profile');
    }

    // Resume upload
    if (field.type === 'file' || this.matchesField(label, id, ['resume', 'cv', 'curriculum vitae'])) {
      if (candidate.resumeStorageKey) {
        return this.mapped(field, candidate.resumeStorageKey, 'resume.storageKey', true);
      }
      return this.needsInput(field, 'No resume uploaded');
    }

    // Salary (never guess)
    if (this.matchesField(label, id, ['salary', 'expected salary', 'compensation', 'salary expectation'])) {
      return this.needsInput(field, 'Salary expectations must be provided by the candidate');
    }

    // Notice period (never guess)
    if (this.matchesField(label, id, ['notice period', 'notice', 'availability'])) {
      return this.needsInput(field, 'Notice period must be provided by the candidate');
    }

    // Work authorization (never guess)
    if (this.matchesField(label, id, ['work authorization', 'visa', 'sponsorship', 'authorized to work', 'work permit'])) {
      return this.needsInput(field, 'Work authorization must be provided by the candidate');
    }

    // Experience duration (never guess)
    if (this.matchesField(label, id, ['experience', 'work experience', 'employment history'])) {
      // This is typically a textarea, not a simple field
      if (field.type === 'textarea') {
        return this.unsupported(field, 'Experience details must be reviewed and provided by the candidate');
      }
      return this.needsInput(field, 'Experience details must be provided by the candidate');
    }

    // Default: unmapped (unknown field)
    return this.unmapped(field, 'Field could not be mapped to verified candidate data');
  }

  private matchesField(label: string, id: string, keywords: string[]): boolean {
    return keywords.some((kw) => label.includes(kw) || id.includes(kw.replace(/\s+/g, '')));
  }

  private mapped(field: ExtractedField, value: string, source: string, verified: boolean): FieldMapping {
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type,
      value,
      source,
      verified,
      result: 'MAPPED',
    };
  }

  private needsInput(field: ExtractedField, reason: string): FieldMapping {
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type,
      value: null,
      source: null,
      verified: false,
      result: 'NEEDS_CANDIDATE_INPUT',
      reason,
    };
  }

  private unmapped(field: ExtractedField, reason: string): FieldMapping {
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type,
      value: null,
      source: null,
      verified: false,
      result: 'UNMAPPED',
      reason,
    };
  }

  private unsupported(field: ExtractedField, reason: string): FieldMapping {
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      fieldType: field.type,
      value: null,
      source: null,
      verified: false,
      result: 'UNSUPPORTED',
      reason,
    };
  }
}