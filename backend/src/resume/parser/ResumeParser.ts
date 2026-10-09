/** Resume parser abstraction. */

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

// Placeholder implementations - will be replaced with actual implementations
class PdfResumeParser implements ResumeParser {
  async extractText(file: Buffer): Promise<string> {
    // Placeholder - will use pdf-parse or similar
    return '';
  }

  async extractStructuredData(text: string): Promise<Record<string, unknown>> {
    // Placeholder - will use deterministic extraction
    return {};
  }

  async parse(file: Buffer): Promise<ParsedResumeResult> {
    const extractedText = await this.extractText(file);
    const structuredData = await this.extractStructuredData(extractedText);
    return {
      extractedText,
      structuredData,
      warnings: [],
    };
  }
}

class DocxResumeParser implements ResumeParser {
  async extractText(file: Buffer): Promise<string> {
    // Placeholder - will use mammoth or similar
    return '';
  }

  async extractStructuredData(text: string): Promise<Record<string, unknown>> {
    // Placeholder - will use deterministic extraction
    return {};
  }

  async parse(file: Buffer): Promise<ParsedResumeResult> {
    const extractedText = await this.extractText(file);
    const structuredData = await this.extractStructuredData(extractedText);
    return {
      extractedText,
      structuredData,
      warnings: [],
    };
  }
}