/** Resume parser abstraction. */

import { PdfResumeParser } from './PdfResumeParser.js';
import { DocxResumeParser } from './DocxResumeParser.js';

export interface ParsedResumeResult {
  extractedText: string;
  structuredData: Record<string, unknown>;
  warnings: Array<{ field: string; message: string; severity: 'warning' | 'error' }>;
}

export interface ResumeParser {
  extractText(file: Buffer): Promise<string>;
  extractStructuredData(text: string): Promise<Record<string, unknown>>;
  parse(file: Buffer): Promise<ParsedResumeResult>;
}

export type SupportedMimeType = 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType);
}

/** Resolve the real format-specific parser (deterministic, no AI calls). */
export function getParserForMimeType(mimeType: SupportedMimeType): ResumeParser {
  switch (mimeType) {
    case 'application/pdf':
      return new PdfResumeParser();
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return new DocxResumeParser();
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}