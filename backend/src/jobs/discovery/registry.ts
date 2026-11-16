/**
 * Configurable company-board registry (first-party job sources).
 *
 * These are EMPLOYER boards exposed via official public job-posting APIs —
 * not universal search engines. Each entry is a real, live-verified board
 * (its official endpoint returned HTTP 200 with a jobs array). To add a
 * company, see JOB_PROVIDERS.md: find the company's Greenhouse/Lever/Ashby
 * board token (from its public job board URL or careers page) and add an
 * entry here or via COMPANY_BOARDS_JSON. Never invent a token — validate it
 * against the official endpoint before enabling.
 */

export type CompanyBoardProvider = 'greenhouse' | 'lever' | 'ashby';

export interface CompanyBoard {
  company: string;
  provider: CompanyBoardProvider;
  /** Public board identifier (Greenhouse board token, Lever, or Ashby). */
  boardToken: string;
  /** Official public board/careers URL. */
  careerUrl: string;
  enabled: boolean;
}

/**
 * Built-in registry. Every board below was verified live against its official
 * endpoint (HTTP 200). `recruitsInIndia` is a hint for docs/UI only; the geo
 * filter still decides India relevance from each listing's actual location.
 */
export const DEFAULT_COMPANY_BOARDS: CompanyBoard[] = [
  // Indian technology companies
  { company: 'Groww', provider: 'greenhouse', boardToken: 'groww', careerUrl: 'https://job-boards.greenhouse.io/groww', enabled: true },
  { company: 'Slice', provider: 'greenhouse', boardToken: 'slice', careerUrl: 'https://job-boards.greenhouse.io/slice', enabled: true },
  { company: 'Druva', provider: 'greenhouse', boardToken: 'druva', careerUrl: 'https://job-boards.greenhouse.io/druva', enabled: true },
  // Global employers that recruit in India (also useful for worldwide-remote)
  { company: 'Cloudflare', provider: 'greenhouse', boardToken: 'cloudflare', careerUrl: 'https://job-boards.greenhouse.io/cloudflare', enabled: true },
  { company: 'GitLab', provider: 'greenhouse', boardToken: 'gitlab', careerUrl: 'https://job-boards.greenhouse.io/gitlab', enabled: true },
  { company: 'Elastic', provider: 'greenhouse', boardToken: 'elastic', careerUrl: 'https://job-boards.greenhouse.io/elastic', enabled: true },
  { company: 'Databricks', provider: 'greenhouse', boardToken: 'databricks', careerUrl: 'https://job-boards.greenhouse.io/databricks', enabled: true },
  { company: 'Datadog', provider: 'greenhouse', boardToken: 'datadog', careerUrl: 'https://job-boards.greenhouse.io/datadog', enabled: true },
  { company: 'Twilio', provider: 'greenhouse', boardToken: 'twilio', careerUrl: 'https://job-boards.greenhouse.io/twilio', enabled: true },
  { company: 'MongoDB', provider: 'greenhouse', boardToken: 'mongodb', careerUrl: 'https://job-boards.greenhouse.io/mongodb', enabled: true },
  // Ashby-hosted boards (live-verified). Kept enabled as additional coverage.
  { company: 'OpenAI', provider: 'ashby', boardToken: 'openai', careerUrl: 'https://jobs.ashbyhq.com/openai', enabled: true },
  { company: 'Notion', provider: 'ashby', boardToken: 'notion', careerUrl: 'https://jobs.ashbyhq.com/notion', enabled: true },
];

/** Build the official public board URL for a provider + token. */
export function boardCareerUrl(provider: CompanyBoardProvider, boardToken: string): string {
  switch (provider) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${boardToken}`;
    case 'lever':
      return `https://jobs.lever.co/${boardToken}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${boardToken}`;
  }
}

function isValidProvider(p: unknown): p is CompanyBoardProvider {
  return p === 'greenhouse' || p === 'lever' || p === 'ashby';
}

/** Parse a COMPANY_BOARDS_JSON override (array of board objects). */
export function parseCompanyBoards(raw: string | undefined): CompanyBoard[] | undefined {
  if (!raw || !raw.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const boards: CompanyBoard[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    if (typeof b.boardToken !== 'string' || !isValidProvider(b.provider)) continue;
    const provider = b.provider;
    const token = b.boardToken.trim();
    if (!token) continue;
    boards.push({
      company: typeof b.company === 'string' && b.company.trim() ? b.company.trim() : token,
      provider,
      boardToken: token,
      careerUrl:
        typeof b.careerUrl === 'string' && b.careerUrl.trim()
          ? b.careerUrl.trim()
          : boardCareerUrl(provider, token),
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
    });
  }
  return boards;
}

/** Active registry: env override if provided, otherwise the built-in defaults. */
export function loadCompanyBoards(rawOverride?: string): CompanyBoard[] {
  const override = parseCompanyBoards(rawOverride);
  const boards = override ?? DEFAULT_COMPANY_BOARDS;
  return boards.filter((b) => b.enabled);
}
