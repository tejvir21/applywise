/** DOCX resume parser implementation using mammoth. */

import * as mammoth from 'mammoth';
import { ResumeParser, ParsedResumeResult } from './ResumeParser.js';

function extractStructuredData(text: string): Record<string, unknown> {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const fullText = lines.join(' ');
  
  return {
    personal: extractPersonalInfo(lines, fullText),
    summary: extractSummary(lines),
    skills: extractSkills(fullText),
    experience: extractExperience(lines),
    education: extractEducation(lines),
    certifications: extractCertifications(fullText),
    projects: extractProjects(fullText),
    links: extractLinks(fullText),
  };
}

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
    return extractStructuredData(text);
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

    return {
      extractedText,
      structuredData: extractStructuredData(extractedText),
      warnings,
    };
  }
}

// Shared extraction functions (duplicated from PdfResumeParser for independence)
function extractPersonalInfo(lines: string[], fullText: string): Record<string, unknown> {
  const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = fullText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  
  let name: string | undefined;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(line) && line.length < 50) {
      name = line;
      break;
    }
  }

  let location: string | undefined;
  for (const line of lines) {
    if (/^[A-Za-z]+,\s*[A-Z]{2}$/.test(line) || /^[A-Za-z]+,\s*[A-Za-z]+$/.test(line)) {
      if (line.length < 60) {
        location = line;
        break;
      }
    }
  }

  return { name, email: emailMatch?.[0], phone: phoneMatch?.[0], location };
}

function extractSummary(lines: string[]): string | undefined {
  const summaryKeywords = ['summary', 'objective', 'profile', 'about'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (summaryKeywords.some(k => line.includes(k)) && line.length > 20) {
      return lines.slice(i, i + 5).join(' ');
    }
  }
  return undefined;
}

function extractSkills(text: string): Array<{ name: string; confidence?: string; source?: string }> {
  const commonSkills = [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
    'react', 'vue', 'angular', 'svelte', 'next.js', 'node.js', 'express', 'django', 'flask',
    'spring', 'asp.net', 'rails', 'laravel',
    'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
    'git', 'ci/cd', 'jenkins', 'github actions', 'gitlab ci',
    'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap',
    'graphql', 'rest', 'grpc', 'websocket',
    'testing', 'jest', 'cypress', 'playwright', 'selenium',
    'agile', 'scrum', 'kanban', 'jira', 'confluence',
  ];
  
  const lowerText = text.toLowerCase();
  const foundSkills: Array<{ name: string; confidence?: string; source?: string }> = [];
  
  for (const skill of commonSkills) {
    const regex = new RegExp(`\\b${skill.replace(/\./g, '\\.')}\\b`, 'i');
    if (regex.test(text)) {
      foundSkills.push({
        name: skill.charAt(0).toUpperCase() + skill.slice(1),
        confidence: 'high',
        source: 'text_match',
      });
    }
  }
  
  const skillsSectionMatch = text.match(/skills?[:\s]+([\s\S]{0,500})/i);
  if (skillsSectionMatch) {
    const sectionText = skillsSectionMatch[1];
    const extracted = sectionText.split(/[,\n•|-]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 50);
    
    for (const skill of extracted) {
      if (!foundSkills.some(f => f.name.toLowerCase() === skill.toLowerCase())) {
        foundSkills.push({
          name: skill,
          confidence: 'medium',
          source: 'skills_section',
        });
      }
    }
  }
  
  return foundSkills.slice(0, 50);
}

function extractExperience(lines: string[]): Array<Record<string, unknown>> {
  const experience: Array<Record<string, unknown>> = [];
  const expKeywords = ['experience', 'employment', 'work history', 'professional experience'];
  
  let inExperienceSection = false;
  let currentExp: Record<string, unknown> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (expKeywords.some(k => lowerLine.includes(k))) {
      inExperienceSection = true;
      continue;
    }
    
    const otherSections = ['education', 'skills', 'projects', 'certifications', 'awards', 'publications'];
    if (inExperienceSection && otherSections.some(s => lowerLine.includes(s))) {
      inExperienceSection = false;
    }
    
    if (!inExperienceSection) continue;
    
    const datePattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}\b/i;
    const hasDate = datePattern.test(line);
    
    if (hasDate && line.length > 5 && line.length < 200) {
      if (currentExp) {
        experience.push(currentExp);
      }
      const parts = line.split(/\s*[–—-]\s*/);
      currentExp = {
        title: parts[0]?.trim(),
        company: parts[1]?.trim(),
        startDate: extractDate(line),
        endDate: extractEndDate(line),
        description: '',
      };
    } else if (inExperienceSection && currentExp && line.length > 10) {
      currentExp.description = (currentExp.description || '') + ' ' + line;
    }
  }
  
  if (currentExp) {
    experience.push(currentExp);
  }
  
  return experience.slice(0, 10);
}

function extractEducation(lines: string[]): Array<Record<string, unknown>> {
  const education: Array<Record<string, unknown>> = [];
  const eduKeywords = ['education', 'academic', 'degree', 'university', 'college', 'school'];
  
  let inEducationSection = false;
  let currentEdu: Record<string, unknown> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (eduKeywords.some(k => lowerLine.includes(k))) {
      inEducationSection = true;
      continue;
    }
    
    const otherSections = ['experience', 'skills', 'projects', 'certifications', 'work'];
    if (inEducationSection && otherSections.some(s => lowerLine.includes(s))) {
      inEducationSection = false;
    }
    
    if (!inEducationSection) continue;
    
    const degreePattern = /\b(?:bachelor|master|phd|ph\.d|doctorate|associate|diploma|certificate|b\.s|m\.s|b\.a|m\.a|mba)\b/i;
    if (degreePattern.test(line) || (inEducationSection && line.length > 5 && line.length < 200)) {
      if (currentEdu) {
        education.push(currentEdu);
      }
      currentEdu = {
        institution: extractInstitution(line),
        degree: extractDegree(line),
        fieldOfStudy: extractField(line),
        startDate: extractDate(line),
        endDate: extractEndDate(line),
        description: '',
      };
    } else if (inEducationSection && currentEdu && line.length > 5) {
      currentEdu.description = (currentEdu.description || '') + ' ' + line;
    }
  }
  
  if (currentEdu) {
    education.push(currentEdu);
  }
  
  return education.slice(0, 10);
}

function extractCertifications(text: string): Array<Record<string, unknown>> {
  const certs: Array<Record<string, unknown>> = [];
  const certKeywords = ['certification', 'certified', 'certificate', 'license'];
  
  for (const keyword of certKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b[^\\n]*`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const certText = match[0].trim();
      if (certText.length > 5 && certText.length < 200) {
        certs.push({
          name: certText,
          issuingOrganization: extractOrg(certText),
          confidence: 'medium',
        });
      }
    }
  }
  
  return certs.slice(0, 10);
}

function extractProjects(text: string): Array<Record<string, unknown>> {
  const projects: Array<Record<string, unknown>> = [];
  const projectKeywords = ['project', 'github', 'portfolio', 'repository'];
  
  for (const keyword of projectKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b[^\\n]*`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const projText = match[0].trim();
      if (projText.length > 5 && projText.length < 200) {
        projects.push({
          name: projText,
          description: projText,
          confidence: 'low',
        });
      }
    }
  }
  
  return projects.slice(0, 10);
}

function extractLinks(text: string): Record<string, unknown> {
  const links: Record<string, unknown> = {};
  const githubMatch = text.match(/github\.com\/[\w-]+/i);
  if (githubMatch) links.github = `https://${githubMatch[0]}`;
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) links.linkedin = `https://${linkedinMatch[0]}`;
  const portfolioMatch = text.match(/\b(?:portfolio|website)[:\s]+(https?:\/\/[\w-./]+)/i);
  if (portfolioMatch) links.portfolio = portfolioMatch[1];
  return links;
}

function extractDate(line: string): string | undefined {
  const match = line.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}\b/i);
  return match?.[0];
}

function extractEndDate(line: string): string | undefined {
  const match = line.match(/(?:to|–|-)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}|present|current)/i);
  return match?.[1]?.toLowerCase() === 'present' || match?.[1]?.toLowerCase() === 'current' ? undefined : match?.[1];
}

function extractInstitution(line: string): string | undefined {
  const instMatch = line.match(/\b(?:university|college|institute|school)\s+of\s+[\w\s]+/i) ||
                   line.match(/\b[\w\s]+(?:university|college|institute)\b/i);
  return instMatch?.[0];
}

function extractDegree(line: string): string | undefined {
  const degMatch = line.match(/\b(?:bachelor|master|phd|ph\.d|doctorate|associate|diploma|certificate|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba)\b[\w\s]*/i);
  return degMatch?.[0];
}

function extractField(line: string): string | undefined {
  const fieldMatch = line.match(/(?:in|of)\s+([\w\s]+)(?:\s+\d{4}|$)/i);
  return fieldMatch?.[1]?.trim();
}

function extractOrg(text: string): string | undefined {
  const orgMatch = text.match(/\b(?:by|from|issued by)\s+([\w\s.]+)/i);
  return orgMatch?.[1]?.trim();
}