/**
 * Deterministic mock provider (default). Builds structured drafts ONLY from
 * the verified facts supplied in the request — it cannot fabricate skills,
 * employers, dates, or credentials because it has no other input. Used in
 * development and in all automated tests; the standard suite never needs a
 * running model.
 */

import type { AIGenerationRequest, AIGenerationResponse, AIProvider } from './AIProvider.js';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

function missingSkillGaps(facts: Record<string, unknown>): string[] {
  const gaps: string[] = [];
  const missing = strArray(facts.missingSkills);
  for (const skill of missing) {
    gaps.push(`No verified record of required skill: ${skill}`);
  }
  if (strArray(facts.skills).length === 0) {
    gaps.push('No verified skills recorded in the candidate profile');
  }
  return gaps;
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateContent(request: AIGenerationRequest): Promise<AIGenerationResponse> {
    const { kind, facts } = request;
    let payload: Record<string, unknown>;
    switch (kind) {
      case 'coverLetter':
        payload = this.coverLetter(facts);
        break;
      case 'resumeDraft':
        payload = this.resumeDraft(facts);
        break;
      case 'answer':
        payload = this.answer(facts);
        break;
      case 'fitExplanation':
        payload = this.fitExplanation(facts);
        break;
      default:
        throw new Error(`Unsupported generation kind: ${kind as string}`);
    }
    return { text: JSON.stringify(payload), model: 'mock-template-v1', provider: 'mock' };
  }

  private coverLetter(facts: Record<string, unknown>) {
    const name = str(facts.candidateName, 'The candidate');
    const headline = str(facts.headline);
    const years = typeof facts.yearsOfExperience === 'number' ? facts.yearsOfExperience : null;
    const skills = strArray(facts.skills).slice(0, 6);
    const jobTitle = str(facts.jobTitle, 'the role');
    const company = str(facts.companyName, 'your company');

    const lines = [
      'Dear Hiring Manager,',
      '',
      `I am ${name}${headline ? `, ${headline}` : ''}${years != null ? ` with ${years} year(s) of experience` : ''}, applying for ${jobTitle} at ${company}.`,
    ];
    if (skills.length > 0) {
      lines.push('', `My verified background includes: ${skills.join(', ')}.`);
    }
    lines.push('', 'I would welcome the opportunity to discuss how my experience relates to this role.');
    return { body: lines.join('\n'), flaggedGaps: missingSkillGaps(facts) };
  }

  private resumeDraft(facts: Record<string, unknown>) {
    const name = str(facts.candidateName, 'The candidate');
    const headline = str(facts.headline, 'Professional');
    const years = typeof facts.yearsOfExperience === 'number' ? facts.yearsOfExperience : null;
    const skills = strArray(facts.skills);
    const jobTitle = str(facts.jobTitle, 'the target role');

    const highlights: string[] = [];
    if (years != null) highlights.push(`${years} year(s) of professional experience`);
    if (headline) highlights.push(headline);
    const currentTitle = str(facts.currentJobTitle);
    if (currentTitle) highlights.push(`Currently working as ${currentTitle}`);

    return {
      summary: `${name} — ${headline}. Tailored for ${jobTitle}. Draft only: review every line before use.`,
      highlights,
      skillsUsed: skills,
      flaggedGaps: missingSkillGaps(facts),
    };
  }

  private answer(facts: Record<string, unknown>) {
    const question = str(facts.question, 'the application question');
    const relevant = strArray(facts.relevantSkills);
    const answer = relevant.length > 0
      ? `Based on the verified profile: ${relevant.join(', ')}. Draft answer to "${question}" — confirm before submitting.`
      : `Draft answer to "${question}" — the verified profile has no directly recorded evidence; confirm or rewrite before submitting.`;
    return { answer, needsConfirmation: true };
  }

  private fitExplanation(facts: Record<string, unknown>) {
    const score = typeof facts.matchScore === 'number' ? facts.matchScore : null;
    return {
      explanation: score != null
        ? `Deterministic match score ${score}/100 against the verified profile. See the factor breakdown for details.`
        : 'Deterministic match computed against the verified profile. See the factor breakdown for details.',
      flaggedGaps: missingSkillGaps(facts),
    };
  }
}
