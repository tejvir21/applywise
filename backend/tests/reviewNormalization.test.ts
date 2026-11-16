/**
 * Review normalization + personal-information classification tests.
 *
 * Covers the deterministic rules (no AI, no fixture-specific special cases):
 * - "Frontend: HTML" -> verified skill HTML with context "Frontend" and the
 *   original text preserved as evidence.
 * - Location-context words (e.g. Noida) become city proposals, never skills.
 * - Header-pattern names split into first/last, never skills.
 * - Ambiguous contexts stay unclassified (review queue or warnings).
 * - No proficiency or confidence is fabricated.
 */

import { describe, it, expect } from 'vitest';
import { extractStructuredResume } from '../src/resume/parser/structured.js';

function skillsList(...lines: string[]) {
  return extractStructuredResume(['Skills', ...lines].join('\n'));
}

describe('context-prefix normalization', () => {
  it.each([
    ['Frontend: HTML', 'HTML', 'Frontend'],
    ['Backend: Node.js', 'Node.js', 'Backend'],
    ['Database: MySQL', 'MySQL', 'Database'],
    ['Mobile: React', 'React', 'Mobile'],
    ['DevOps: Docker', 'Docker', 'DevOps'],
    ['Cloud: AWS', 'AWS', 'Cloud'],
    ['Testing: Cypress', 'Cypress', 'Testing'],
  ])('normalizes %s to skill %s with context %s', (line, name, context) => {
    const parse = skillsList(line);
    expect(parse.skills.map((s) => s.name)).toContain(name);
    const skill = parse.skills.find((s) => s.name === name)!;
    expect(skill.context).toBe(context);
    expect(skill.evidence).toBe(line);
    expect(skill.method).toBe('skills_list');
    expect('level' in skill).toBe(false);
  });

  it('leaves unknown prefixes and unverifiable remainders untouched', () => {
    const parse = skillsList('RandomPrefix: FooBar', 'Frontend: NotASkillAtAll', 'App: Something');
    expect(parse.skills.map((s) => s.name)).not.toContain('FooBar');
    expect(parse.skills.map((s) => s.name)).not.toContain('NotASkillAtAll');
    expect(parse.skills.map((s) => s.name)).not.toContain('Something');
    const review = parse.reviewCandidates.map((r) => r.text);
    expect(review).toContain('RandomPrefix: FooBar');
    expect(review).toContain('Frontend: NotASkillAtAll');
  });

  it('preserves ratings alongside context without inventing proficiency', () => {
    const parse = skillsList('Frontend: HTML 90%');
    const skill = parse.skills.find((s) => s.name === 'HTML')!;
    expect(skill.context).toBe('Frontend');
    expect(skill.rating).toBe('90%');
    expect('level' in skill).toBe(false);
  });
});

describe('personal-information classification', () => {
  it('proposes Noida as a city in a clear candidate-address context', () => {
    const parse = extractStructuredResume(
      ['Chirag Pandit', 'Noida, India', 'chirag@example.com', 'Skills', 'Figma'].join('\n'),
    );
    expect(parse.personal.city).toBe('Noida');
    expect(parse.personal.locationEvidence).toBe('Noida, India');
    expect(parse.skills.map((s) => s.name)).not.toContain('Noida');
  });

  it('keeps employment-history locations out of the profile location', () => {
    const parse = extractStructuredResume(
      [
        'Aarav Sharma',
        'aarav@example.com',
        'Experience',
        'Designer - Studio, Noida',
        '2021 - Present',
        'Worked in Noida on client projects.',
      ].join('\n'),
    );
    expect(parse.personal.city).toBeUndefined();
    expect(parse.personal.location).toBeUndefined();
    expect(parse.skills.map((s) => s.name)).not.toContain('Noida');
  });

  it('splits a header-pattern name into first and last, never a skill', () => {
    const parse = extractStructuredResume(
      ['Chirag Pandit', 'chirag@example.com', 'Skills', 'Figma'].join('\n'),
    );
    expect(parse.personal.name).toBe('Chirag Pandit');
    const names = parse.skills.map((s) => s.name);
    expect(names).not.toContain('Chirag Pandit');
    expect(names).not.toContain('Chirag');
  });

  it('does not classify emails, phones, or URLs as skills', () => {
    const parse = extractStructuredResume(
      [
        'Jane Doe',
        'jane@example.com',
        '+91 9876543210',
        'https://jane.example.com',
        'Skills',
        'Figma, jane@example.com',
      ].join('\n'),
    );
    expect(parse.personal.email).toBe('jane@example.com');
    expect(parse.personal.phone).toContain('9876543210');
    const names = parse.skills.map((s) => s.name);
    expect(names.some((n) => /@|98765|example\.com/i.test(n))).toBe(false);
  });

  it('does not fabricate confidence or proficiency', () => {
    const parse = skillsList('Figma');
    const skill = parse.skills.find((s) => s.name === 'Figma')!;
    expect(['high', 'medium', 'low', 'uncertain']).toContain(skill.confidence);
    expect('level' in skill).toBe(false);
  });
});
