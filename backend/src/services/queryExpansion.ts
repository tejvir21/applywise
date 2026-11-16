/**
 * Query expansion (Phase 4).
 *
 * A single keyword can miss relevant roles. We map a role to a bounded set of
 * related searches, then dedupe the combined results downstream and remember
 * which discovered each listing. Expansions are capped so we never fan out
 * into unbounded upstream requests.
 */

/** Role-aware related-search map (keys are matched case-insensitively). */
const ROLE_SYNONYMS: Record<string, string[]> = {
  'react developer': ['Frontend Developer', 'React.js Developer', 'Frontend Engineer', 'Software Engineer — Frontend', 'TypeScript Developer', 'Full Stack Developer'],
  'react.js developer': ['React Developer', 'Frontend Developer', 'Frontend Engineer', 'TypeScript Developer'],
  'frontend developer': ['React Developer', 'Frontend Engineer', 'UI Developer', 'JavaScript Developer', 'TypeScript Developer'],
  'frontend engineer': ['Frontend Developer', 'React Developer', 'Software Engineer — Frontend', 'UI Developer'],
  'full stack developer': ['Full Stack Engineer', 'Software Engineer — Frontend', 'Backend Developer', 'MERN Stack Developer'],
  'software engineer': ['Software Developer', 'Backend Engineer', 'Frontend Engineer', 'Full Stack Developer', 'SDE'],
  'typescript developer': ['Frontend Developer', 'Node.js Developer', 'JavaScript Developer'],
  'backend developer': ['Backend Engineer', 'Software Engineer — Backend', 'Node.js Developer', 'Full Stack Developer'],
  'node.js developer': ['Backend Developer', 'Full Stack Developer', 'JavaScript Developer'],
  'devops engineer': ['Site Reliability Engineer', 'Cloud Engineer', 'Platform Engineer'],
};

/** Normalize a role for map lookup. */
function key(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Expand the caller's role list into a deduped, ordered, bounded query set.
 * The original roles come first (user intent preserved), then related queries.
 */
export function expandQueries(roles: string[], maxQueries = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    const k = key(q);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(q.trim());
    }
  };

  // 1) original roles first
  for (const r of roles) {
    if (r.trim()) push(r);
  }
  // 2) related queries for each original role
  for (const r of roles) {
    const syn = ROLE_SYNONYMS[key(r)];
    if (syn) syn.forEach(push);
  }

  return out.slice(0, maxQueries);
}
