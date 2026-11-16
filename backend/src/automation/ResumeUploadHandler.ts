/**
 * Resume Upload Handler (Phase 9.1.2).
 *
 * Handles uploading an approved resume to a form file input.
 * Retrieves file bytes through the existing owner-scoped resume service
 * and storage abstraction, then attaches them via Playwright setInputFiles.
 */

import type { Page } from 'playwright';
import { Types } from 'mongoose';
import { downloadResume } from '../services/ResumeService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export interface ResumeUploadResult {
  fieldId: string;
  status: 'UPLOADED' | 'FAILED' | 'SKIPPED';
  resumeId?: string;
  filename?: string;
  contentType?: string;
  error?: string;
}

export class ResumeUploadHandler {
  async uploadResume(
    page: Page,
    fieldId: string,
    resumeId: string,
    userId: Types.ObjectId,
  ): Promise<ResumeUploadResult> {
    try {
      // 1. Retrieve resume metadata + file stream via owner-scoped service
      const { stream, filename, contentType } = await downloadResume(userId, resumeId);

      // 2. Read stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      // 3. Validate file type
      const allowedMimes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedMimes.includes(contentType)) {
        return {
          fieldId,
          status: 'FAILED',
          error: `Unsupported file type: ${contentType}`,
        };
      }

      // 4. Validate file size
      const maxBytes = 10 * 1024 * 1024; // 10MB
      if (buffer.length > maxBytes) {
        return {
          fieldId,
          status: 'FAILED',
          error: `File size exceeds ${maxBytes / 1024 / 1024}MB limit`,
        };
      }

      // 5. Verify the file input exists
      const fileInput = page.locator(`#${fieldId}`).first();
      const inputCount = await fileInput.count();
      if (inputCount === 0) {
        return {
          fieldId,
          status: 'FAILED',
          error: `File input #${fieldId} not found on page`,
        };
      }

      // 6. Upload via Playwright setInputFiles with buffer
      await fileInput.setInputFiles({
        name: filename,
        mimeType: contentType,
        buffer,
      });

      // 7. Verify the file was attached
      const files = await fileInput.evaluate((el: any) => el.files?.length ?? 0);
      if (files === 0) {
        return {
          fieldId,
          status: 'FAILED',
          error: 'File was not attached to the input',
        };
      }

      return {
        fieldId,
        status: 'UPLOADED',
        resumeId,
        filename,
        contentType,
      };
    } catch (err) {
      return {
        fieldId,
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}