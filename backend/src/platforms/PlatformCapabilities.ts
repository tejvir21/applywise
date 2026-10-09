/**
 * Platform capability model (Phase 8).
 *
 * Each capability is independently graded for every platform. Statuses:
 * - supported:   verified working through an authorized mechanism (with evidence).
 * - unsupported: explicitly prohibited or closed to us (partnership-gated and
 *                not accepting, robots-disallowed, or terms-prohibited), with evidence.
 * - unavailable: no authorized mechanism exists or could be found.
 * - unverified:  not yet assessed — treated as unknown everywhere.
 *
 * Rules enforced by consumers of this registry:
 * - Submission is NEVER inferred from discovery.
 * - Anything unverified (or unknown) fails closed: no automatic submission.
 */

export type CapabilityStatus = 'supported' | 'unsupported' | 'unverified' | 'unavailable';

export type CapabilityKey =
  | 'discovery'
  | 'detail'
  | 'questions'
  | 'prepare'
  | 'upload'
  | 'submit'
  | 'verify'
  | 'handoff';

export const CAPABILITY_KEYS: CapabilityKey[] = [
  'discovery',
  'detail',
  'questions',
  'prepare',
  'upload',
  'submit',
  'verify',
  'handoff',
];

export interface CapabilityAssessment {
  status: CapabilityStatus;
  /** Authoritative evidence (docs URL, robots.txt rule, dated finding). */
  evidence?: string;
  /** What authorization would be required, if any path exists. */
  authorization?: string;
  notes?: string;
}

export interface PlatformDescriptor {
  platform: string;
  displayName: string;
  website?: string;
  capabilities: Record<CapabilityKey, CapabilityAssessment>;
  lastReviewed: string;
}

function cap(
  status: CapabilityStatus,
  extra: Partial<Pick<CapabilityAssessment, 'evidence' | 'authorization' | 'notes'>> = {},
): CapabilityAssessment {
  return { status, ...extra };
}

/**
 * Researched capability matrix (October 2026). Findings:
 * - LinkedIn: Job Posting API + Apply Connect are employer/ATS-partner-side,
 *   approval-gated, and "currently not accepting new partnerships"
 *   (Microsoft Learn, linkedin-api-docs). No candidate-side apply API exists.
 * - Indeed: robots.txt disallows all bots from /applystart, /viewjob,
 *   /jobs*, /job*, /rc/, /graphql and related apply/search internals; the
 *   publisher/developer portal is unreachable and Indeed Apply is an
 *   employer-side partnership product. No authorized candidate path found.
 * - Naukri: robots.txt is bot-walled (403); no public candidate API program
 *   found. No authorized path evidenced.
 * - Apna: no public API program found (unverified for discovery detail).
 * - Wellfound: recruiter-side product site verified live; no public
 *   candidate-side API found.
 * - Career sites (generic): per-site job pages exist, but no general
 *   authorized automation mechanism; user-controlled handoff only.
 * Handoff (opening the posting's own application URL in the user's browser
 * with prepared drafts + instructions) is supported everywhere because it
 * performs no automation and bypasses nothing.
 */
export const PLATFORMS: PlatformDescriptor[] = [
  {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    website: 'https://www.linkedin.com',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unsupported', {
        evidence: 'https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview — Job Posting API restricted to approved partners; "currently not accepting new partnerships". No public job-search API for third-party candidate agents.',
        authorization: 'LinkedIn Talent Solutions partnership + API agreement (closed to new applicants)',
      }),
      detail: cap('unsupported', {
        evidence: 'Same partnership-gated API surface; no candidate-side detail endpoint.',
      }),
      questions: cap('unsupported', {
        evidence: 'https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/apply-connect-overview — application questions flow ATS-side to LinkedIn, not outward.',
      }),
      prepare: cap('supported', {
        notes: 'Drafts can be prepared from any posting data the candidate lawfully has; preparation performs no platform interaction.',
      }),
      upload: cap('unavailable', { notes: 'No authorized candidate-side document upload endpoint exists.' }),
      submit: cap('unsupported', {
        evidence: 'Apply Connect is ATS-partner-side (requires partnership + Recruiter license); no authorized candidate submission API.',
        authorization: 'LinkedIn partnership (closed to new applicants)',
      }),
      verify: cap('unavailable', { notes: 'Submission status flows to ATS partners, not to candidate agents.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
  {
    platform: 'indeed',
    displayName: 'Indeed',
    website: 'https://www.indeed.com',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unsupported', {
        evidence: 'https://www.indeed.com/robots.txt disallows all bots from /jobs*, /job*, /viewjob, /graphql, /rpc/ and related paths; publisher/developer portal unreachable.',
      }),
      detail: cap('unsupported', { evidence: 'Same robots.txt disallow set covers job detail and view paths.' }),
      questions: cap('unavailable', { notes: 'No authorized question-retrieval mechanism found.' }),
      prepare: cap('supported', { notes: 'Drafts can be prepared from posting data the candidate lawfully has.' }),
      upload: cap('unavailable', { notes: 'No authorized candidate-side document upload endpoint found.' }),
      submit: cap('unsupported', {
        evidence: 'https://www.indeed.com/robots.txt disallows /applystart for all bots; Indeed Apply is an employer-side partnership product.',
      }),
      verify: cap('unavailable', { notes: 'No candidate-side verification API found.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
  {
    platform: 'naukri',
    displayName: 'Naukri',
    website: 'https://www.naukri.com',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unavailable', {
        evidence: 'https://www.naukri.com/robots.txt returns 403 to automated fetching; no public candidate API program found.',
      }),
      detail: cap('unavailable', { notes: 'No authorized detail endpoint found.' }),
      questions: cap('unavailable', { notes: 'No authorized question-retrieval mechanism found.' }),
      prepare: cap('supported', { notes: 'Drafts can be prepared from posting data the candidate lawfully has.' }),
      upload: cap('unavailable', { notes: 'No authorized candidate-side document upload endpoint found.' }),
      submit: cap('unavailable', { notes: 'No authorized candidate submission API found.' }),
      verify: cap('unavailable', { notes: 'No candidate-side verification API found.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
  {
    platform: 'apna',
    displayName: 'Apna',
    website: 'https://apna.co',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unverified', { notes: 'No public API program found; not yet fully assessed.' }),
      detail: cap('unverified', { notes: 'Not yet assessed.' }),
      questions: cap('unavailable', { notes: 'No authorized question-retrieval mechanism found.' }),
      prepare: cap('supported', { notes: 'Drafts can be prepared from posting data the candidate lawfully has.' }),
      upload: cap('unavailable', { notes: 'No authorized candidate-side document upload endpoint found.' }),
      submit: cap('unavailable', { notes: 'No authorized candidate submission API found.' }),
      verify: cap('unavailable', { notes: 'No candidate-side verification API found.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
  {
    platform: 'wellfound',
    displayName: 'Wellfound',
    website: 'https://wellfound.com',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unavailable', {
        evidence: 'https://wellfound.com/developers serves the recruiter product site; no public candidate-side API found.',
      }),
      detail: cap('unavailable', { notes: 'No authorized detail endpoint found.' }),
      questions: cap('unavailable', { notes: 'No authorized question-retrieval mechanism found.' }),
      prepare: cap('supported', { notes: 'Drafts can be prepared from posting data the candidate lawfully has.' }),
      upload: cap('unavailable', { notes: 'No authorized candidate-side document upload endpoint found.' }),
      submit: cap('unavailable', { notes: 'No authorized candidate submission API found.' }),
      verify: cap('unavailable', { notes: 'No candidate-side verification API found.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
  {
    platform: 'career-site',
    displayName: 'Company career sites (generic)',
    lastReviewed: '2026-10-09',
    capabilities: {
      discovery: cap('unavailable', { notes: 'No general authorized mechanism; per-site assessment required.' }),
      detail: cap('unavailable', { notes: 'Per-site assessment required.' }),
      questions: cap('unavailable', { notes: 'Per-site assessment required.' }),
      prepare: cap('supported', { notes: 'Drafts can be prepared from posting data the candidate lawfully has.' }),
      upload: cap('unavailable', { notes: 'No general authorized mechanism.' }),
      submit: cap('unavailable', { notes: 'No general authorized mechanism; per-site automation would need explicit permission.' }),
      verify: cap('unavailable', { notes: 'No general mechanism.' }),
      handoff: cap('supported', { notes: 'User opens the posting application URL themselves; no automation involved.' }),
    },
  },
];

export function getPlatform(platform: string): PlatformDescriptor | undefined {
  return PLATFORMS.find((p) => p.platform === platform);
}

export function getCapability(platform: string, key: CapabilityKey): CapabilityAssessment | undefined {
  return getPlatform(platform)?.capabilities[key];
}

/**
 * True only when the registry verifies a supported submission path for the
 * platform. Derived from assessed data — never inferred from discovery.
 * Currently false for every platform (no verified authorized path exists).
 */
export function isSubmissionSupported(platform: string): boolean {
  return getCapability(platform, 'submit')?.status === 'supported';
}
