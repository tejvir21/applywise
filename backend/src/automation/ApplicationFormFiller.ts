/**
 * Application Form Filler (Phase 9.0).
 *
 * Safely fills form fields with verified candidate data.
 * Verifies values after filling. Never silently skips required fields.
 */

import type { Page, Locator } from 'playwright';
import type { ExtractedField } from './FormFieldExtractor.js';
import type { FieldMapping } from './CandidateFieldMapper.js';
import { ResumeUploadHandler } from './ResumeUploadHandler.js';
import { Types } from 'mongoose';

export type FillStatus = 'FILLED' | 'SKIPPED' | 'NEEDS_CANDIDATE_INPUT' | 'FAILED' | 'UNSUPPORTED';

export interface FillResult {
  fieldId: string;
  fieldLabel: string;
  status: FillStatus;
  value?: string;
  error?: string;
  verified: boolean;
}

export interface FillSummary {
  total: number;
  filled: number;
  skipped: number;
  needsInput: number;
  failed: number;
  unsupported: number;
  results: FillResult[];
}

export class ApplicationFormFiller {
  async fillForm(page: Page, fields: ExtractedField[], mappings: FieldMapping[], options?: { resumeId?: string; userId?: string }): Promise<FillSummary> {
    const results: FillResult[] = [];

    for (const field of fields) {
      const mapping = mappings.find((m) => m.fieldId === field.id);
      if (!mapping) {
        results.push({
          fieldId: field.id,
          fieldLabel: field.label,
          status: 'SKIPPED',
          error: 'No mapping found',
          verified: false,
        });
        continue;
      }

      const result = await this.fillField(page, field, mapping, options);
      results.push(result);
    }

    return {
      total: results.length,
      filled: results.filter((r) => r.status === 'FILLED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      needsInput: results.filter((r) => r.status === 'NEEDS_CANDIDATE_INPUT').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      unsupported: results.filter((r) => r.status === 'UNSUPPORTED').length,
      results,
    };
  }

  private async fillField(page: Page, field: ExtractedField, mapping: FieldMapping, options?: { resumeId?: string; userId?: string }): Promise<FillResult> {
    if (mapping.result === 'NEEDS_CANDIDATE_INPUT') {
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        status: 'NEEDS_CANDIDATE_INPUT',
        error: mapping.reason,
        verified: false,
      };
    }

    if (mapping.result === 'UNSUPPORTED') {
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        status: 'UNSUPPORTED',
        error: mapping.reason,
        verified: false,
      };
    }

    if (mapping.result === 'UNMAPPED' || !mapping.value) {
      // Never silently skip required fields — mark as needing candidate input
      if (field.required) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          status: 'NEEDS_CANDIDATE_INPUT',
          error: mapping.reason || 'Required field could not be mapped to verified candidate data',
          verified: false,
        };
      }
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        status: 'SKIPPED',
        error: mapping.reason || 'No value to fill',
        verified: false,
      };
    }

    try {
      const locator = page.locator(field.locator).first();

      switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
        case 'number':
        case 'date':
        case 'textarea':
          await locator.fill(mapping.value);
          break;
        case 'select':
          await locator.selectOption(mapping.value).catch(async () => {
            // If exact match fails, try case-insensitive
            const options = await locator.locator('option').allTextContents();
            const match = options.find((o) => o.toLowerCase().includes(mapping.value!.toLowerCase()));
            if (match) await locator.selectOption(match);
          });
          break;
        case 'radio':
          // Select the radio button matching the value
          await page.locator(`input[type="radio"][name="${field.id}"][value="${mapping.value}"]`).check();
          break;
        case 'checkbox':
          // Only check if the value is 'true' or 'yes' (never auto-accept terms)
          if (mapping.value.toLowerCase() === 'true' || mapping.value.toLowerCase() === 'yes') {
            await locator.check();
          } else {
            return {
              fieldId: field.id,
              fieldLabel: field.label,
              status: 'NEEDS_CANDIDATE_INPUT',
              error: 'Checkbox requires explicit candidate consent',
              verified: false,
            };
          }
          break;
        case 'file': {
          // File upload handled by ResumeUploadHandler using stored resume bytes
          if (!options?.resumeId || !options?.userId) {
            return {
              fieldId: field.id,
              fieldLabel: field.label,
              status: 'SKIPPED',
              error: 'No resume selected for file upload',
              verified: false,
            };
          }
          const handler = new ResumeUploadHandler();
          const uploadResult = await handler.uploadResume(
            page,
            field.id,
            options.resumeId,
            new Types.ObjectId(options.userId),
          );
          if (uploadResult.status === 'UPLOADED') {
            return {
              fieldId: field.id,
              fieldLabel: field.label,
              status: 'FILLED',
              value: uploadResult.filename,
              verified: true,
            };
          }
          return {
            fieldId: field.id,
            fieldLabel: field.label,
            status: uploadResult.status === 'FAILED' ? 'FAILED' : 'SKIPPED',
            error: uploadResult.error,
            verified: false,
          };
        }
        default:
          return {
            fieldId: field.id,
            fieldLabel: field.label,
            status: 'UNSUPPORTED',
            error: `Unsupported field type: ${field.type}`,
            verified: false,
          };
      }

      // Verify the value was set
      const actualValue = await locator.inputValue().catch(() => '');
      const verified = actualValue === mapping.value || actualValue.toLowerCase().includes(mapping.value.toLowerCase());

      return {
        fieldId: field.id,
        fieldLabel: field.label,
        status: verified ? 'FILLED' : 'FAILED',
        value: mapping.value,
        error: verified ? undefined : `Value mismatch: expected "${mapping.value}", got "${actualValue}"`,
        verified,
      };
    } catch (err) {
      return {
        fieldId: field.id,
        fieldLabel: field.label,
        status: 'FAILED',
        value: mapping.value,
        error: err instanceof Error ? err.message : 'Unknown error',
        verified: false,
      };
    }
  }
}