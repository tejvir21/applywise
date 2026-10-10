/** DOCX resume parser implementation using mammoth. */

import * as mammoth from 'mammoth';
import { ResumeParser, ParsedResumeResult } from './ResumeParser.js';
import { extractStructuredResume } from './structured.js';

export class DocxResumeParser implements ResumeParser {
  async extractText(file: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer: file });
      return result.value || '';
    } catch (error) {
      throw new Error(`DOCX text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractStructuredData(text: string): Promise<Record<string, unknown>> {
    // Section-aware deterministic extraction (shared with the PDF parser).
    return extractStructuredResume(text) as unknown as Record<string, unknown>;
  }

  async parse(file: Buffer): Promise<ParsedResumeResult> {
    const extractedText = await this.extractText(file);
    const warnings: Array<{ field: string; message: string; severity: 'warning' | 'error' }> = [];

    if (!extractedText || extractedText.trim().length < 50) {
      warnings.push({
        field: 'extractedText',
        message: 'Text extraction yielded minimal content.',
        severity: 'warning',
      });
    }

    const structured = extractStructuredResume(extractedText);

    return {
      extractedText,
      structuredData: structured as unknown as Record<string, unknown>,
      warnings: [...warnings, ...structured.warnings],
    };
  }
}
