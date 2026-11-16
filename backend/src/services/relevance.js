/**
 * Relevance ranking for discovery.
 *
 * This is intentionally a SIMPLE, transparent lexical relevance signal used
 * only to (a) keep company-board noise out and (b) offer a "relevance" sort.
 * It is NOT the candidate-vs-job match score from JobMatchingService; that
 * formula is untouched and continues to power the dedicated matches page.
 * Relevance ranking here is kept independent from freshness ranking.
 */

export interface RelevanceInput {
  title: string;
  companyName?: string;
  description?: string;
}

const SYNONYMS: Record<string, string[]> = {
  react: ['reactjs', 'react.js'],
  reactjs: ['react', 'react.js'],
  frontend: ['front-end', 'front end', 'ui'],
  'fullstack': ['full-stack', 'full stack'],
  typescript: ['ts'],
  js: ['javascript'],
  javascript: ['js'],
};

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9.+#]+/g) ?? []).map((t) => t.replace(/\./g, ''));
}

function norm(s: string): string {
  return s.replace(/\./g, '');
}

function expand(tokens: string[]): Set<string> {
  const out = new Set<string>();
  const normTokens = tokens.map(norm);
  for (const raw of normTokens) out.add(raw);
  for (const [key, alts] of Object.entries(SYNONYMS)) {
    const nKey = norm(key);
    const nAlts = alts.map(norm);
    if (normTokens.includes(nKey)) nAlts.forEach((a) => out.add(a));
    if (nAlts.some((a) => normTokens.includes(a))) out.add(nKey);
  }
  return out;
}

/** Relevance of a job to a single query, in [0, ~1]. */
export function relevanceScore(job: RelevanceInput, query: string): number {
  const qTokens = expand(tokenize(query));
  if (qTokens.size === 0) return 0;
  const titleToks = new Set(tokenize(job.title));
  const companyToks = new Set(tokenize(job.companyName ?? ''));
  const descToks = new Set(tokenize(job.description ?? ''));

  let score = 0;
  for (const tk of qTokens) {
    if (tk.length < 2) continue;
    if (titleHas(titleToks, tk)) score += 3;
    else if (companyHas(companyToks, tk)) score += 1;
    else if (descHas(descToks, tk)) score += 0.5;
  }
  // Normalize by a per-token max of 3.
  const maxScore = qTokens.size * 3;
  return Math.min(1, score / maxScore);
}

// Slightly fuzzy contains so "backend" matches "back-end".
function titleHas(set: Set<string>, tk: string): boolean {
  if (set.has(tk)) return true;
  for (const w of set) if (w.includes(tk) || tk.includes(w)) return true;
  return false;
}
function companyHas(set: Set<string>, tk: string): boolean {
  return set.has(tk);
}
function descHas(set: Set<string>, tk: string): boolean {
  return set.has(tk) || Array.from(set).some((w) => w.includes(tk));
}

/** Best relevance across the expanded query set + which query achieved it. */
export function bestRelevance(
  job: RelevanceInput,
  queries: string[],
): { score: number; matchedQuery: string } {
  let best = { score: 0, matchedQuery: queries[0] ?? '' };
  for (const q of queries) {
    const s = relevanceScore(job, q);
    if (s > best.score) best = { score: s, matchedQuery: q };
  }
  return best;
}
