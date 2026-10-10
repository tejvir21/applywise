/** PDF resume parser implementation using pdf-parse. */

import { PDFParse } from 'pdf-parse';
import { ResumeParser, ParsedResumeResult } from './ResumeParser.js';
import { extractStructuredResume } from './structured.js';

export class PdfResumeParser implements ResumeParser {
  async extractText(file: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: file });
      const result = await parser.getText();
      return result.text || '';
    } catch (error) {
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractStructuredData(text: string): Promise<Record<string, unknown>> {
    // Section-aware deterministic extraction (shared with the DOCX parser).
    return extractStructuredResume(text) as unknown as Record<string, unknown>;
  }

  async parse(file: Buffer): Promise<ParsedResumeResult> {
    const extractedText = await this.extractText(file);
    const warnings: Array<{ field: string; message: string; severity: 'warning' | 'error' }> = [];

    // Check if text extraction yielded meaningful content
    if (!extractedText || extractedText.trim().length < 50) {
      warnings.push({
        field: 'extractedText',
        message: 'Text extraction yielded minimal content. The PDF may be scanned/image-based.',
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
