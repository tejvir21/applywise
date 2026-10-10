/**
 * Shared deterministic resume-structure extraction (PDF + DOCX).
 *
 * Design rules (accuracy-first):
 * - Sections are segmented on header lines; skills are read from the Skills
 *   section first and only supplemented by dictionary matches evidenced in
 *   Experience/Projects text.
 * - A verified skill must match the maintained alias dictionary. Anything
 *   else from a skills list becomes a *review candidate* — never a skill.
 *   Dates, names, locations, contact fragments, URLs, and project titles can
 *   never become skills.
 * - No proficiency is inferred: import never assigns beginner/intermediate/
 *   advanced/expert. Confidence reflects evidence strength (section + match
 *   type), never mere completion.
 * - Candidate location comes only from the contact/header region and only
 *   from digit-free location lines. Employer/school/project locations stay
 *   inside their sections.
 * - Links are typed by hostname, restricted to http(s), and never fetched.
 */

export type SkillConfidence = 'high' | 'medium' | 'low' | 'uncertain';
export type ReviewStatus = 'verified' | 'needs_review';
export type SkillSection = 'skills' | 'experience' | 'projects' | 'summary' | 'education' | 'coursework' | 'languages' | 'other';
export type ExtractionMethod = 'skills_list' | 'dictionary_match' | 'review_approved';
/**
 * Skill category. Technical/design/domain/language/soft/coursework travel
 * with the analysis record; only supported fields (name, category) are
 * imported to the profile — coursework is never auto-imported as
 * professional experience.
 */
export type SkillCategory = 'technical' | 'design' | 'soft' | 'language' | 'domain' | 'coursework';

export interface VerifiedSkill {
  name: string;
  evidence: string;
  section: SkillSection;
  method: ExtractionMethod;
  confidence: SkillConfidence;
  reviewStatus: 'verified';
  /**
   * Source-provided numeric rating printed beside the skill (e.g. "90%").
   * Preserved verbatim as evidence — never converted into a proficiency
   * level (beginner/intermediate/advanced) by the parser or the importer.
   */
  rating?: string;
  /** Category for display and import grouping. Never inferred proficiency. */
  category?: SkillCategory;
  /**
   * Language proficiency exactly as stated on the resume (e.g. "Fluent",
   * "Native", "B2"). Analysis-only: never mapped to a profile skill level.
   */
  proficiency?: string;
}

export interface ReviewCandidate {
  text: string;
  reason: string;
  section: SkillSection;
}

export interface ParsedContact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  locationEvidence?: string;
}

export interface TypedLink {
  type: 'github' | 'linkedin' | 'portfolio' | 'website' | 'other';
  url: string;
}

export interface AnalysisWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface StructuredParse {
  personal: ParsedContact;
  summary?: string;
  skills: VerifiedSkill[];
  reviewCandidates: ReviewCandidate[];
  experience: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  links: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
    website?: string;
    other?: string[];
  };
  warnings: AnalysisWarning[];
}

/** Canonical display name -> aliases. `category` defaults to 'technical'. */
const SKILL_ALIASES: Array<{ canonical: string; aliases: string[]; category?: SkillCategory }> = [
  { canonical: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript'] },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts'] },
  { canonical: 'Python', aliases: ['python'] },
  { canonical: 'Java', aliases: ['java'] },
  { canonical: 'C++', aliases: ['c++'] },
  { canonical: 'C#', aliases: ['c#', 'csharp'] },
  { canonical: 'Go', aliases: ['go', 'golang'] },
  { canonical: 'Rust', aliases: ['rust'] },
  { canonical: 'Ruby', aliases: ['ruby'] },
  { canonical: 'PHP', aliases: ['php'] },
  { canonical: 'React', aliases: ['react', 'react.js', 'reactjs'] },
  { canonical: 'Vue', aliases: ['vue', 'vue.js'] },
  { canonical: 'Angular', aliases: ['angular', 'angular.js'] },
  { canonical: 'Svelte', aliases: ['svelte'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs', 'next'] },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { canonical: 'Express', aliases: ['express', 'express.js'] },
  { canonical: 'Redux', aliases: ['redux'] },
  { canonical: 'Django', aliases: ['django'] },
  { canonical: 'Flask', aliases: ['flask'] },
  { canonical: 'Spring', aliases: ['spring', 'spring boot', 'springboot'] },
  { canonical: 'ASP.NET', aliases: ['asp.net', 'aspnet'] },
  { canonical: 'Rails', aliases: ['rails', 'ruby on rails'] },
  { canonical: 'Laravel', aliases: ['laravel'] },
  { canonical: 'MERN', aliases: ['mern', 'mern stack'] },
  { canonical: 'MEAN', aliases: ['mean', 'mean stack'] },
  { canonical: 'SQL', aliases: ['sql'] },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres'] },
  { canonical: 'MySQL', aliases: ['mysql'] },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongo'] },
  { canonical: 'Redis', aliases: ['redis'] },
  { canonical: 'Elasticsearch', aliases: ['elasticsearch'] },
  { canonical: 'DynamoDB', aliases: ['dynamodb'] },
  { canonical: 'AWS', aliases: ['aws', 'amazon web services'] },
  { canonical: 'Azure', aliases: ['azure'] },
  { canonical: 'GCP', aliases: ['gcp', 'google cloud'] },
  { canonical: 'Docker', aliases: ['docker'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { canonical: 'Terraform', aliases: ['terraform'] },
  { canonical: 'Ansible', aliases: ['ansible'] },
  { canonical: 'Git', aliases: ['git'] },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'cicd', 'ci cd'] },
  { canonical: 'Jenkins', aliases: ['jenkins'] },
  { canonical: 'GitHub Actions', aliases: ['github actions'] },
  { canonical: 'HTML', aliases: ['html', 'html5'] },
  { canonical: 'CSS', aliases: ['css', 'css3'] },
  { canonical: 'Sass', aliases: ['sass', 'scss'] },
  { canonical: 'Less', aliases: ['less'] },
  { canonical: 'Tailwind', aliases: ['tailwind', 'tailwindcss', 'tailwind css'] },
  { canonical: 'Bootstrap', aliases: ['bootstrap'] },
  { canonical: 'GraphQL', aliases: ['graphql'] },
  { canonical: 'REST', aliases: ['rest', 'rest api', 'restful'] },
  { canonical: 'gRPC', aliases: ['grpc'] },
  { canonical: 'WebSocket', aliases: ['websocket', 'websockets'] },
  { canonical: 'Jest', aliases: ['jest'] },
  { canonical: 'Cypress', aliases: ['cypress'] },
  { canonical: 'Playwright', aliases: ['playwright'] },
  { canonical: 'Selenium', aliases: ['selenium'] },
  { canonical: 'Agile', aliases: ['agile'] },
  { canonical: 'Scrum', aliases: ['scrum'] },
  { canonical: 'Kanban', aliases: ['kanban'] },
  { canonical: 'Jira', aliases: ['jira'] },
  { canonical: 'Confluence', aliases: ['confluence'] },
  { canonical: 'Figma', aliases: ['figma'], category: 'design' },
  { canonical: 'UI/UX', aliases: ['ui/ux', 'ui-ux', 'ux/ui'], category: 'design' },
  { canonical: 'Storyboards', aliases: ['storyboards', 'storyboard', 'storyboarding'], category: 'design' },
  { canonical: 'Process Flows', aliases: ['process flows', 'process flow'], category: 'design' },
  { canonical: 'Mockups', aliases: ['mockups', 'mockup', 'mock-up', 'mock-ups'], category: 'design' },
  { canonical: 'Webflow', aliases: ['webflow'], category: 'design' },
  { canonical: 'Adobe XD', aliases: ['adobe xd', 'xd'], category: 'design' },
  { canonical: 'Photoshop', aliases: ['photoshop', 'adobe photoshop'], category: 'design' },
  { canonical: 'Illustrator', aliases: ['illustrator', 'adobe illustrator'], category: 'design' },
  { canonical: 'InDesign', aliases: ['indesign'], category: 'design' },
  { canonical: 'Sketch', aliases: ['sketch'], category: 'design' },
  { canonical: 'Framer', aliases: ['framer'], category: 'design' },
  { canonical: 'Canva', aliases: ['canva'], category: 'design' },
  { canonical: 'Miro', aliases: ['miro'], category: 'design' },
  { canonical: 'After Effects', aliases: ['after effects'], category: 'design' },
  { canonical: 'Premiere Pro', aliases: ['premiere pro', 'premiere'], category: 'design' },
  { canonical: 'User Research', aliases: ['user research'], category: 'design' },
  { canonical: 'Wireframing', aliases: ['wireframing', 'wireframes'], category: 'design' },
  { canonical: 'Prototyping', aliases: ['prototyping', 'prototypes'], category: 'design' },
  { canonical: 'Usability Testing', aliases: ['usability testing'], category: 'design' },
  { canonical: 'Interaction Design', aliases: ['interaction design'], category: 'design' },
  { canonical: 'Visual Design', aliases: ['visual design'], category: 'design' },
  { canonical: 'Design Systems', aliases: ['design systems', 'design system'], category: 'design' },
  { canonical: 'Responsive Design', aliases: ['responsive design'], category: 'design' },
  { canonical: 'User Flows', aliases: ['user flows', 'user flow'], category: 'design' },
  { canonical: 'Information Architecture', aliases: ['information architecture'], category: 'design' },
  { canonical: 'Accessibility', aliases: ['accessibility', 'wcag'], category: 'design' },
  // Civil engineering tools (technical) and domain concepts.
  { canonical: 'AutoCAD', aliases: ['autocad', 'autocad 2d', 'autocad 3d'] },
  { canonical: 'STAAD Pro', aliases: ['staad pro', 'staad', 'staad.pro'] },
  { canonical: 'ETABS', aliases: ['etabs'] },
  { canonical: 'Primavera', aliases: ['primavera', 'primavera p6'] },
  { canonical: 'MS Project', aliases: ['ms project', 'microsoft project', 'msp'] },
  { canonical: 'Revit', aliases: ['revit'] },
  { canonical: 'SAP2000', aliases: ['sap2000', 'sap 2000'] },
  { canonical: 'Total Station', aliases: ['total station'] },
  { canonical: 'MATLAB', aliases: ['matlab'] },
  { canonical: 'Surveying', aliases: ['surveying', 'survey', 'chain surveying', 'levelling', 'leveling'], category: 'domain' },
  { canonical: 'Estimation', aliases: ['estimation', 'quantity estimation', 'quantity surveying', 'cost estimation'], category: 'domain' },
  { canonical: 'Structural Analysis', aliases: ['structural analysis'], category: 'domain' },
  { canonical: 'RCC Design', aliases: ['rcc design', 'rcc', 'reinforced concrete'], category: 'domain' },
  { canonical: 'Concrete Technology', aliases: ['concrete technology', 'concrete', 'cube testing'], category: 'domain' },
  { canonical: 'Soil Mechanics', aliases: ['soil mechanics', 'soil testing', 'geotechnical'], category: 'domain' },
  { canonical: 'Fluid Mechanics', aliases: ['fluid mechanics', 'hydraulics'], category: 'domain' },
  { canonical: 'Transportation Engineering', aliases: ['transportation engineering', 'highway design'], category: 'domain' },
  { canonical: 'Construction Management', aliases: ['construction management', 'site execution'], category: 'domain' },
  { canonical: 'Project Planning', aliases: ['project planning'], category: 'domain' },
  { canonical: 'Quality Control', aliases: ['quality control', 'quality assurance', 'qa/qc'], category: 'domain' },
  // Office administration tools.
  { canonical: 'MS Excel', aliases: ['ms excel', 'excel', 'microsoft excel'] },
  { canonical: 'MS Office', aliases: ['ms office', 'microsoft office', 'office 365'] },
  { canonical: 'PowerPoint', aliases: ['powerpoint', 'ppt', 'ms powerpoint'] },
  { canonical: 'Word', aliases: ['ms word', 'microsoft word'] },
  { canonical: 'Outlook', aliases: ['outlook', 'ms outlook'] },
  { canonical: 'SAP', aliases: ['sap', 'sap erp'] },
];

interface DictEntry {
  canonical: string;
  alias: string;
  regex: RegExp;
  short: boolean;
  category: SkillCategory;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Dictionary entries, longest alias first so "JavaScript" wins over "Java".
 * Boundaries block in-word matches ("Java" in "JavaScript", "Node" in
 * "Node.js" — the longer alias claims the span first) while still matching
 * at sentence ends ("design systems."). The trailing dot is excluded from
 * the lookahead so terminal punctuation never hides a real skill.
 */
const DICTIONARY: DictEntry[] = SKILL_ALIASES.flatMap((entry) =>
  entry.aliases.map((alias) => ({
    canonical: entry.canonical,
    alias,
    regex: new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(alias)}(?![A-Za-z0-9+#])`, 'i'),
    short: alias.replace(/[^a-z0-9]/gi, '').length <= 2,
    category: entry.category ?? 'technical',
  })),
).sort((a, b) => b.alias.length - a.alias.length);

function lookupEntry(token: string): DictEntry | null {
  const lower = token.toLowerCase();
  for (const entry of DICTIONARY) {
    if (entry.alias.toLowerCase() === lower) return entry;
  }
  return null;
}

function lookupCanonical(token: string): string | null {
  return lookupEntry(token)?.canonical ?? null;
}

/**
 * Soft skills verified ONLY from explicit skill lists (never from running
 * prose — "Communication Design" is a degree, not a soft skill claim).
 */
const KNOWN_SOFT: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Communication', aliases: ['communication', 'communication skills'] },
  { canonical: 'Leadership', aliases: ['leadership', 'team leadership'] },
  { canonical: 'Teamwork', aliases: ['teamwork', 'team player'] },
  { canonical: 'Team Management', aliases: ['team management'] },
  { canonical: 'Time Management', aliases: ['time management'] },
  { canonical: 'Problem Solving', aliases: ['problem solving', 'problem-solving'] },
  { canonical: 'Critical Thinking', aliases: ['critical thinking'] },
  { canonical: 'Adaptability', aliases: ['adaptability', 'adaptable'] },
  { canonical: 'Collaboration', aliases: ['collaboration'] },
  { canonical: 'Attention to Detail', aliases: ['attention to detail', 'detail-oriented', 'detail oriented'] },
  { canonical: 'Multitasking', aliases: ['multitasking', 'multi-tasking'] },
  { canonical: 'Organization', aliases: ['organization', 'organizational skills'] },
  { canonical: 'Interpersonal Skills', aliases: ['interpersonal skills'] },
  { canonical: 'Decision Making', aliases: ['decision making'] },
  { canonical: 'Conflict Resolution', aliases: ['conflict resolution'] },
  { canonical: 'Work Ethic', aliases: ['work ethic'] },
];

function lookupSoft(token: string): string | null {
  const lower = token.toLowerCase();
  for (const entry of KNOWN_SOFT) {
    if (entry.aliases.some((a) => a.toLowerCase() === lower)) return entry.canonical;
  }
  return null;
}

/** Languages with explicit, commonly understood names. Proficiency is parsed
 *  separately and only ever preserved as stated. */
const KNOWN_LANGUAGES = [
  'english', 'hindi', 'spanish', 'french', 'german', 'italian', 'portuguese',
  'russian', 'chinese', 'mandarin', 'japanese', 'korean', 'arabic', 'tamil',
  'telugu', 'bengali', 'marathi', 'kannada', 'malayalam', 'gujarati',
  'punjabi', 'urdu', 'dutch', 'swedish', 'polish', 'turkish', 'vietnamese', 'thai',
];

function lookupLanguage(token: string): string | null {
  const lower = token.toLowerCase();
  const hit = KNOWN_LANGUAGES.find((l) => l === lower);
  if (!hit) return null;
  return hit.charAt(0).toUpperCase() + hit.slice(1);
}

/** Stated language levels recognized without a separator ("English Fluent").
 *  Anything else stays unverified: proficiency is only preserved as stated. */
const KNOWN_PROFICIENCY = new Set(
  ['fluent', 'native', 'basic', 'beginner', 'elementary', 'intermediate', 'advanced', 'bilingual', 'conversational', 'professional', 'limited', 'working', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'].map((s) => s.toLowerCase()),
);

/**
 * Split "English (Fluent)" / "English - Fluent" / "English: Native" into
 * [language, stated proficiency]. Bare "English Fluent" works only when the
 * second word is a recognized level word. Returns null when no known
 * language leads.
 */
function splitLanguageProficiency(token: string): [string, string?] | null {
  const explicit = token.match(/^([A-Za-z]+)\s*[(:\-–—]\s*([^():;]+?)\s*\)?$/);
  if (explicit) {
    const canonical = lookupLanguage(explicit[1]);
    if (!canonical) return null;
    const proficiency = explicit[2].trim().replace(/%.+$/, '').trim();
    if (!proficiency || proficiency.length > 30) return null;
    return [canonical, proficiency];
  }
  const bare = token.match(/^([A-Za-z]+)\s+([A-Za-z0-9+/]+)$/);
  if (bare) {
    const canonical = lookupLanguage(bare[1]);
    if (!canonical) return null;
    if (!KNOWN_PROFICIENCY.has(bare[2].toLowerCase())) return null;
    return [canonical, bare[2]];
  }
  return null;
}

const MONTH_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const LOREM_RE = /\blorem\s+ipsum\b/i;
/** Obvious template filler: street addresses, cities, and contacts no real
 *  candidate would hold. Matched case-insensitively against display text. */
const PLACEHOLDER_ADDRESS_RE = /123\s+anywhere|any\s+city|\bST\s+12345\b|555[-.\s]?01\d\d|example\.(com|org|net)/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/** Phone shapes: 3-3-4 plus common 5+5 / 4+6 mobile groupings. */
const PHONE_RE = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{5}[-.\s]?\d{5}|\d{4}[-.\s]?\d{6})/;
const URL_RE = /https?:\/\/[^\s,;|)'"\]]+/gi;
const UNSAFE_URL_RE = /\b(javascript|data|vbscript|file):[^\s,;|)'"\]]*/gi;

/** Collapse a match into a short readable evidence snippet. */
function snippet(text: string, index: number, length: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${raw}${end < text.length ? '…' : ''}`.slice(0, 160);
}

export type SectionName =
  | 'contact'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'languages'
  | 'coursework'
  | 'other';

const HEADER_PATTERNS: Array<{ section: SectionName; pattern: RegExp }> = [
  { section: 'summary', pattern: /^(?:(?:professional\s+)?summary|objective|profile|about(?:\s+me)?)$/ },
  { section: 'skills', pattern: /^(?:(?:(?:technical|core)\s+)?skills?|key\s+skills?|soft\s+skills?|tools?(?:\s+and\s+technologies)?|technologies|tech\s+stack|technical\s+toolbox|core\s+competencies|competencies)$/ },
  { section: 'experience', pattern: /^(?:(?:(?:professional|work)\s+)?experience|employment(?:\s+history)?|work\s+history|training|industrial\s+training|internships?|apprenticeship)$/ },
  { section: 'projects', pattern: /^(?:projects?|selected\s+projects?|personal\s+projects?|academic\s+projects?)$/ },
  { section: 'education', pattern: /^(?:education|academic(?:\s+background)?|qualifications?)$/ },
  { section: 'certifications', pattern: /^(?:certifications?|certificates?|licenses?)$/ },
  { section: 'languages', pattern: /^(?:languages?|spoken\s+languages?)$/ },
  { section: 'coursework', pattern: /^(?:coursework|academic\s+coursework|courses?|relevant\s+courses?)$/ },
];

export interface Section {
  name: SectionName;
  lines: string[];
}

function headerNameOf(text: string): SectionName | null {
  const clean = text.trim().toLowerCase();
  if (clean.length === 0 || clean.length > 48) return null;
  for (const { section, pattern } of HEADER_PATTERNS) {
    if (pattern.test(clean)) return section;
  }
  return null;
}

/** A bare header line ("Technical Skills:"). Lines carrying inline content
 *  after a colon ("Skills: TypeScript, React") are content, not headers —
 *  swallowing them is exactly how skill lists used to get lost. */
function isHeaderLine(line: string): SectionName | null {
  if (!line.endsWith(':') && line.includes(':')) return null;
  return headerNameOf(line.replace(/:$/, ''));
}

/** Segment lines into sections. Everything before the first header is contact.
 *  Inline "Header: content" lines open the section AND keep their content.
 *
 *  Two-column recovery: when a raw line splits (on wide gaps) into segments
 *  that are ALL headers ("SKILLS  LANGUAGES"), the column->section mapping
 *  is remembered and subsequent multi-segment lines route each segment to
 *  its column's section. Mixed lines route non-header segments via the
 *  active mapping, then reset it. Single lines always go to the current
 *  section. This is gap-based text recovery, not layout analysis: genuinely
 *  ambiguous single lines may still misattribute, and are labeled with the
 *  section they landed in so reviewers can tell.
 */
export function segmentSections(rawLines: string[]): Section[] {
  const sections: Section[] = [{ name: 'contact', lines: [] }];
  let columns: SectionName[] | null = null;
  const openSection = (name: SectionName): Section => {
    sections.push({ name, lines: [] });
    return sections[sections.length - 1];
  };
  const current = () => sections[sections.length - 1];

  const handleLine = (line: string) => {
    const colon = line.indexOf(':');
    if (colon > 0 && colon < 60 && !line.endsWith(':')) {
      const head = headerNameOf(line.slice(0, colon));
      const rest = line.slice(colon + 1).trim();
      if (head && head !== 'contact' && rest.length > 0) {
        openSection(head).lines.push(rest);
        return;
      }
    }
    const header = isHeaderLine(line);
    if (header && header !== 'contact') {
      openSection(header);
    } else {
      current().lines.push(line);
    }
  };

  for (const raw of rawLines) {
    const segments = raw.split(/\s{2,}|\t/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (segments.length <= 1) {
      handleLine(raw.trim());
      continue;
    }
    const headerOf = segments.map(headerOfSegment);
    if (headerOf.every((h) => h && h !== 'contact')) {
      columns = headerOf as SectionName[];
      for (const name of columns) openSection(name);
      continue;
    }
    if (columns) {
      // Route each segment to its column's section. Header segments open
      // their section instead of becoming content (a bare "EDUCATION" must
      // never be parsed as a skill or a location); inline "Header: content"
      // keeps its content.
      let sawHeader = false;
      segments.forEach((segment, i) => {
        const head = headerOfSegment(segment);
        if (head && head !== 'contact') {
          const opened = openSection(head);
          const colon = segment.indexOf(':');
          if (colon > 0 && !segment.endsWith(':')) {
            const rest = segment.slice(colon + 1).trim();
            if (rest.length > 0) opened.lines.push(rest);
          }
          sawHeader = true;
          return;
        }
        const target = columns![Math.min(i, columns!.length - 1)];
        const section = sections.find((s) => s.name === target) ?? openSection(target);
        section.lines.push(segment);
      });
      // A mixed line means the layout shifted: keep routed content, reset.
      if (sawHeader) columns = null;
      continue;
    }
    for (const segment of segments) handleLine(segment);
  }
  return sections;
}

/** Header for a column segment: inline "Header: content" counts, so mixed
 *  lines like "Visual Design 87%  EDUCATION" route correctly. */
function headerOfSegment(segment: string): SectionName | null {
  const colon = segment.indexOf(':');
  if (colon > 0 && colon < 60 && !segment.endsWith(':')) return headerNameOf(segment.slice(0, colon));
  return isHeaderLine(segment);
}

function sectionText(section: Section | undefined): string {
  return (section?.lines ?? []).join('\n');
}

/**
 * Content-based rescue for misattributed lines between adjacent Skills and
 * Languages sections (typical after two-column splits drop single lines in
 * the wrong column). A line that clearly belongs to the other section moves;
 * ambiguous lines stay put and are labeled with the section they landed in.
 */
function reconcileSkillLanguageLines(sections: Section[], warnings: AnalysisWarning[]): void {
  const skills = sections.find((s) => s.name === 'skills');
  const languages = sections.find((s) => s.name === 'languages');
  if (!skills || !languages) return;
  const looksSkill = (line: string): boolean => {
    const [term] = splitRating(line);
    if (lookupEntry(term)) return true;
    return matchDictionary(line, 'other').length > 0;
  };
  const looksLanguage = (line: string): boolean => {
    if (splitLanguageProficiency(line) || lookupLanguage(line)) return true;
    return false;
  };
  let moved = 0;
  const keepLanguages: string[] = [];
  for (const line of languages.lines) {
    if (looksSkill(line) && !looksLanguage(line)) {
      skills.lines.push(line);
      moved += 1;
    } else {
      keepLanguages.push(line);
    }
  }
  languages.lines = keepLanguages;
  const keepSkills: string[] = [];
  for (const line of skills.lines) {
    if (looksLanguage(line) && !looksSkill(line)) {
      languages.lines.push(line);
      moved += 1;
    } else {
      keepSkills.push(line);
    }
  }
  skills.lines = keepSkills;
  if (moved > 0) {
    warnings.push({
      field: 'skills',
      message: `${moved} line(s) reassigned between Skills and Languages sections by content; verify placement in review.`,
      severity: 'warning',
    });
  }
}

/**
 * Match the dictionary against a section, returning verified skills with
 * evidence. Longer aliases claim their spans first so "Java" never shadows
 * "JavaScript". Short tokens (<=2 chars) are too ambiguous in running text
 * and are only accepted as explicit skills-list items.
 */
function matchDictionary(
  text: string,
  section: SkillSection,
  opts: { allowShort?: boolean; confidence?: SkillConfidence } = {},
): VerifiedSkill[] {
  const found: VerifiedSkill[] = [];
  const claimed: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const entry of DICTIONARY) {
    if (entry.short && !opts.allowShort) continue;
    let m: RegExpExecArray | null;
    // Global flag: every exec() advances past the previous match, so
    // overlapping/duplicate hits skip forward instead of looping forever.
    const re = new RegExp(entry.regex.source, entry.regex.flags.includes('g') ? entry.regex.flags : `${entry.regex.flags}g`);
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      if (seen.has(entry.canonical)) continue;
      seen.add(entry.canonical);
      found.push({
        name: entry.canonical,
        evidence: snippet(text, start, m[0].length),
        section,
        method: 'dictionary_match',
        confidence: opts.confidence ?? (section === 'skills' ? 'high' : 'medium'),
        reviewStatus: 'verified',
        category: entry.category,
      });
      break;
    }
  }
  return found;
}

/** Obvious non-skills: contact fragments, dates, URLs, numbers, filler. */
function junkReason(token: string): string | null {
  if (token.length > 60) return 'too long to be a skill';
  if (LOREM_RE.test(token)) return 'placeholder text';
  if (EMAIL_RE.test(token)) return 'contains an email fragment';
  if (/https?:\/\/|www\.|\.com\b/i.test(token)) return 'contains a URL';
  if (PHONE_RE.test(token)) return 'contains a phone fragment';
  if (YEAR_RE.test(token)) return 'contains a year';
  if (MONTH_RE.test(token)) return 'contains a month name';
  if (/\d/.test(token) && token.replace(/[^0-9]/g, '').length >= 3) return 'contains a number';
  if (/^\d{1,3}\s*%$/.test(token)) return 'bare percentage without a skill name';
  if (token.split(/\s+/).length > 4) return 'too long to be a skill';
  return null;
}

/**
 * Split a trailing source-provided rating ("Visual Design 87%", "UI/UX: 95%")
 * from the skill term. Returns [term, rating]. The rating is preserved
 * verbatim as evidence and never converted to a proficiency level.
 */
function splitRating(token: string): [string, string?] {
  const m = token.match(/^(.*?)[\s:–—-]+(\d{1,3}\s*%)$/);
  if (m && m[1].trim().length > 1) return [m[1].trim(), m[2].replace(/\s+/g, '')];
  return [token, undefined];
}

/**
 * Parse explicit skills-list lines. Verification stays dictionary-grounded:
 * dictionary hits (with their category), known soft skills (category soft),
 * and known languages (category language) become verified; short aliases are
 * accepted as deliberate list items. Everything else becomes a review
 * candidate after junk filtering (dates, contact fragments, institutions,
 * titles, placeholders, fragments are dropped first), or is dropped.
 */
function parseSkillsList(
  lines: string[],
  reviewCandidates: ReviewCandidate[],
  warnings: AnalysisWarning[],
): VerifiedSkill[] {
  const verified: VerifiedSkill[] = [];
  const seen = new Set<string>();
  const push = (skill: VerifiedSkill) => {
    if (seen.has(skill.name)) return;
    seen.add(skill.name);
    verified.push(skill);
  };

  for (const line of lines) {
    if (LOREM_RE.test(line)) {
      warnings.push({
        field: 'skills',
        message: 'Skills section contains placeholder (Lorem Ipsum) text, which was excluded.',
        severity: 'warning',
      });
      continue;
    }
    // Split on list delimiters — but never inside "UI/UX" or "CI/CD": a bare
    // slash only separates when padded with whitespace ("Figma / Photoshop").
    const tokens = line
      .split(/[,;•·|]|\s+\/|\/\s+/)
      .map((t) => t.replace(/^[-*–—\s]+/, '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
    for (const token of tokens) {
      if (token.length <= 1) continue;
      if (LOREM_RE.test(token)) continue;
      // Source-provided rating ("UI/UX 95%"): verify the term, keep the
      // number verbatim as evidence — never as inferred proficiency.
      const [term, rating] = splitRating(token);
      const extra = rating ? { rating } : {};
      const entry = lookupEntry(term);
      if (entry) {
        push({
          name: entry.canonical,
          evidence: token,
          section: 'skills',
          method: 'skills_list',
          confidence: 'high',
          reviewStatus: 'verified',
          category: entry.category,
          ...extra,
        });
        continue;
      }
      // Known soft skills and languages are explicit candidate claims:
      // verified with their category, never as technical skills.
      const soft = lookupSoft(term);
      if (soft) {
        push({
          name: soft,
          evidence: token,
          section: 'skills',
          method: 'skills_list',
          confidence: 'medium',
          reviewStatus: 'verified',
          category: 'soft',
          ...extra,
        });
        continue;
      }
      const langSplit = splitLanguageProficiency(term);
      const langOnly = langSplit ? null : lookupLanguage(term);
      if (langSplit || langOnly) {
        const [name, proficiency] = langSplit ?? [langOnly!, undefined];
        push({
          name,
          evidence: token,
          section: 'skills',
          method: 'skills_list',
          confidence: 'medium',
          reviewStatus: 'verified',
          category: 'language',
          ...(proficiency ? { proficiency } : {}),
          ...extra,
        });
        continue;
      }
      // Short dictionary aliases as explicit items (e.g. "Go", "R").
      const shortHit = DICTIONARY.find((e) => e.short && e.alias.toLowerCase() === term.toLowerCase());
      if (shortHit) {
        push({
          name: shortHit.canonical,
          evidence: token,
          section: 'skills',
          method: 'skills_list',
          confidence: 'high',
          reviewStatus: 'verified',
          category: shortHit.category,
          ...extra,
        });
        continue;
      }
      const junk = junkReason(token);
      if (junk) continue;
      if (reviewCandidates.length < 25) {
        reviewCandidates.push({ text: token, reason: `unrecognized term (${junk ?? 'not in skill dictionary'})`, section: 'skills' });
      }
    }
  }
  if (reviewCandidates.length >= 25) {
    warnings.push({
      field: 'skills',
      message: 'Many unrecognized skills-section terms were held for review instead of being added as skills.',
      severity: 'warning',
    });
  }
  return verified;
}

/**
 * Parse an explicit Languages section. Known languages verify with category
 * 'language'; proficiency travels only when stated on the resume
 * ("English - Fluent") and is preserved verbatim, never mapped to a level.
 */
function parseLanguagesSection(
  lines: string[],
  reviewCandidates: ReviewCandidate[],
  warnings: AnalysisWarning[],
): VerifiedSkill[] {
  const verified: VerifiedSkill[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (LOREM_RE.test(line)) continue;
    const tokens = line
      .split(/[,;•·|]/)
      .map((t) => t.replace(/^[-*–—\s]+/, '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 1);
    for (const token of tokens) {
      const split = splitLanguageProficiency(token);
      const bare = split ? null : lookupLanguage(token);
      if (split || bare) {
        const [name, proficiency] = split ?? [bare!, undefined];
        if (seen.has(name)) continue;
        seen.add(name);
        verified.push({
          name,
          evidence: token,
          section: 'languages',
          method: 'skills_list',
          confidence: 'medium',
          reviewStatus: 'verified',
          category: 'language',
          ...(proficiency ? { proficiency } : {}),
        });
        continue;
      }
      const junk = junkReason(token);
      if (junk) continue;
      if (reviewCandidates.length < 25) {
        reviewCandidates.push({ text: token, reason: `unrecognized language (${junk ?? 'not a known language'})`, section: 'languages' });
      }
    }
  }
  if (reviewCandidates.some((r) => r.section === 'languages')) {
    warnings.push({
      field: 'languages',
      message: 'Some language entries were held for review instead of being verified.',
      severity: 'warning',
    });
  }
  return verified;
}

/**
 * Parse coursework lines. Dictionary hits verify with category 'coursework'
 * (never auto-imported as professional skills); unknown terms fall back to a
 * substring scan so "Estimation and Costing" still evidences Estimation,
 * otherwise they become review candidates.
 */
function parseCourseworkLines(
  lines: string[],
  reviewCandidates: ReviewCandidate[],
  warnings: AnalysisWarning[],
): VerifiedSkill[] {
  const verified: VerifiedSkill[] = [];
  const seen = new Set<string>();
  const push = (skill: VerifiedSkill) => {
    if (seen.has(skill.name)) return;
    seen.add(skill.name);
    verified.push(skill);
  };
  for (const line of lines) {
    if (LOREM_RE.test(line)) continue;
    const tokens = line
      .split(/[,;•·|]/)
      .map((t) => t.replace(/^[-*–—\s]+/, '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 1);
    for (const token of tokens) {
      const entry = lookupEntry(token);
      if (entry) {
        push({
          name: entry.canonical,
          evidence: token,
          section: 'coursework',
          method: 'skills_list',
          confidence: 'medium',
          reviewStatus: 'verified',
          category: 'coursework',
        });
        continue;
      }
      // Substring fallback: "Estimation and Costing" evidences Estimation.
      const hits = matchDictionary(token, 'coursework', { confidence: 'low' });
      const fresh = hits.filter((h) => !seen.has(h.name));
      if (fresh.length > 0) {
        for (const h of fresh) push({ ...h, category: 'coursework', evidence: token });
        continue;
      }
      const junk = junkReason(token);
      if (junk) continue;
      if (reviewCandidates.length < 25) {
        reviewCandidates.push({ text: token, reason: `unrecognized coursework term (${junk ?? 'not in skill dictionary'})`, section: 'coursework' });
      }
    }
  }
  return verified;
}

function mergeSkills(primary: VerifiedSkill[], extra: VerifiedSkill[]): VerifiedSkill[] {  const seen = new Set(primary.map((s) => s.name));
  const merged = [...primary];
  for (const skill of extra) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    merged.push(skill);
  }
  return merged.slice(0, 60);
}

function extractName(lines: string[]): string | undefined {
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(line) && line.length < 50) {
      return line;
    }
  }
  return undefined;
}

/**
 * Candidate location comes ONLY from the contact region and ONLY from
 * digit-free "City, State/Country" lines. Employment lines such as
 * "Noida June 3" (digits/month) are rejected, and digit-bearing
 * location-like lines produce an honest warning instead of a silent guess.
 */
function extractCandidateLocation(
  contactLines: string[],
  warnings: AnalysisWarning[],
): Pick<ParsedContact, 'location' | 'city' | 'state' | 'country' | 'locationEvidence'> {
  for (const line of contactLines.slice(0, 14)) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line)) continue;
    if (!line.includes(',')) continue;
    // Template/placeholder addresses are never a verified candidate location.
    if (PLACEHOLDER_ADDRESS_RE.test(line)) {
      warnings.push({
        field: 'personal.location',
        message: `Placeholder address detected and not used as the candidate location: "${line.slice(0, 80)}".`,
        severity: 'warning',
      });
      continue;
    }
    // A "Title - Company, City" job line is employment context, not the
    // candidate's location (common after column-gap splitting).
    if (/\s[–—-]\s/.test(line) || line.length > 80) {
      warnings.push({
        field: 'personal.location',
        message: `Ambiguous location-like text was not used as the candidate location: "${line.slice(0, 80)}".`,
        severity: 'warning',
      });
      continue;
    }
    if (/\d/.test(line) || MONTH_RE.test(line)) {
      warnings.push({
        field: 'personal.location',
        message: `Ambiguous location-like text was not used as the candidate location: "${line.slice(0, 80)}".`,
        severity: 'warning',
      });
      continue;
    }
    const m = line.match(/^([A-Za-z][A-Za-z .'\-&]*),\s*([A-Za-z][A-Za-z .'\-&]*)(?:,\s*([A-Za-z][A-Za-z .'\-&]*))?$/);
    if (!m) continue;
    const [, part1, part2, part3] = m;
    const result: Pick<ParsedContact, 'location' | 'city' | 'state' | 'country' | 'locationEvidence'> = {
      location: line,
      city: part1.trim(),
      locationEvidence: line,
    };
    if (part3) {
      result.state = part2.trim();
      result.country = part3.trim();
    } else if (/^[A-Za-z]{2,3}$/.test(part2.trim())) {
      result.state = part2.trim();
    } else {
      result.country = part2.trim();
    }
    return result;
  }
  return {};
}

function extractContact(sections: Section[], fullText: string, warnings: AnalysisWarning[]): ParsedContact {
  const contactSection = sections.find((s) => s.name === 'contact');
  const contactLines = contactSection?.lines ?? [];
  const emailMatch = fullText.match(EMAIL_RE);
  const phoneMatch = fullText.match(PHONE_RE);
  return {
    name: extractName(contactLines.length > 0 ? contactLines : sections.flatMap((s) => s.lines)),
    email: emailMatch?.[0],
    phone: phoneMatch?.[0]?.replace(/\s+/g, ' ').trim(),
    ...extractCandidateLocation(contactLines, warnings),
  };
}

/**
 * Typed links by hostname. Only http(s) survives; unsafe schemes are
 * rejected with a warning. URLs are never fetched.
 */
export function extractTypedLinks(
  text: string,
  warnings: AnalysisWarning[],
): { links: StructuredParse['links']; typed: TypedLink[] } {
  const candidates = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    candidates.add(m[0].replace(/[.,;:!?)]+$/, ''));
  }
  for (const m of text.matchAll(/(?:www\.|)(?:linkedin\.com|github\.com)\/[^\s,;|)'"\]]+/gi)) {
    const raw = m[0].replace(/[.,;:!?)]+$/, '');
    candidates.add(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  }
  for (const m of text.matchAll(UNSAFE_URL_RE)) {
    warnings.push({
      field: 'links',
      message: `Rejected unsafe URL scheme: "${m[0].slice(0, 40)}".`,
      severity: 'warning',
    });
  }

  const links: StructuredParse['links'] = { other: [] };
  const typed: TypedLink[] = [];
  const seen = new Set<string>();
  // Bare linkedin/github domains (typical contact-block profile links) win
  // over longer in-text URLs: a multi-segment github URL is a repository,
  // not the candidate's profile, and belongs in `other`.
  const ordered = [...candidates].sort((a, b) => {
    const bare = (u: string) => /^(https?:\/\/)?(www\.)?(linkedin\.com|github\.com)\/[^/]+$/i.test(u);
    return Number(bare(b)) - Number(bare(a));
  });
  for (const raw of ordered) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      warnings.push({ field: 'links', message: `Rejected non-HTTP(S) URL: "${raw.slice(0, 60)}".`, severity: 'warning' });
      continue;
    }
    const normalized = parsed.toString();
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    const host = parsed.hostname.toLowerCase();
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    let type: TypedLink['type'];
    if (/(^|\.)linkedin\.com$/.test(host)) type = pathSegments.length <= 2 ? 'linkedin' : 'other';
    else if (/(^|\.)github\.com$/.test(host)) type = pathSegments.length <= 1 ? 'github' : 'other';
    else if (!links.portfolio) type = 'portfolio';
    else if (!links.website) type = 'website';
    else type = 'other';
    typed.push({ type, url: normalized });
    if (type === 'other') links.other!.push(normalized);
    else (links as Record<string, unknown>)[type] = normalized;
  }
  if (links.other!.length === 0) delete links.other;
  return { links, typed };
}

function extractSummaryText(sections: Section[], warnings: AnalysisWarning[]): string | undefined {
  const summary = sections.find((s) => s.name === 'summary');
  if (!summary || summary.lines.length === 0) return undefined;
  // Drop the header echo if the first line is just the header word.
  const lines = [...summary.lines];
  if (lines.length > 1 && /^(summary|objective|profile|about)/i.test(lines[0]) && lines[0].length < 30) {
    lines.shift();
  }
  const text = lines.join(' ').trim();
  if (text.length === 0) return undefined;
  // Placeholder filler is not a summary: report it, don't propagate it.
  if (LOREM_RE.test(text)) {
    warnings.push({
      field: 'summary',
      message: 'Summary section contains placeholder (Lorem Ipsum) text and was excluded from import.',
      severity: 'warning',
    });
    return undefined;
  }
  return text;
}

function extractDate(line: string): string | undefined {
  const match = line.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}\b/i);
  return match?.[0];
}

function extractEndDate(line: string): string | undefined {
  const match = line.match(/(?:to|–|-)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}|present|current)/i);
  return match?.[1]?.toLowerCase() === 'present' || match?.[1]?.toLowerCase() === 'current' ? undefined : match?.[1];
}

function technologiesIn(text: string): string[] {
  return matchDictionary(text, 'experience').map((s) => s.name);
}

/**
 * Collapse byte-identical repeated entries (template filler duplicated the
 * same degree/job block). Distinct periods and qualifications are preserved;
 * only exact normalized duplicates are removed, and the count is reported.
 */
function dedupEntries(
  entries: Array<Record<string, unknown>>,
  keyOf: (e: Record<string, unknown>) => string,
  field: string,
  warnings: AnalysisWarning[],
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const out: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  if (out.length < entries.length) {
    warnings.push({
      field,
      message: `${entries.length - out.length} duplicate ${field} ${entries.length - out.length === 1 ? 'entry was' : 'entries were'} consolidated; distinct periods retained.`,
      severity: 'warning',
    });
  }
  return out;
}

function normKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** A line that is primarily a date range ("2022 - Present", "Jan 2020 - 2022"). */
function isDateRangeLine(line: string): boolean {
  if (line.length > 80) return false;
  return /^\s*[\w\s.,]*\d{4}\s*(–|—|-|to)\s*(\w+\s+\d{4}|\d{4}|present|current)\s*$/i.test(line);
}

function splitTitleCompany(line: string): { title?: string; company?: string } {
  const parts = line.split(/\s*[–—-]\s*/);
  if (parts.length >= 2) return { title: parts[0]?.trim() || undefined, company: parts.slice(1).join(' - ').trim() || undefined };
  const comma = line.indexOf(',');
  if (comma > 0 && comma < 100) {
    return { title: line.slice(0, comma).trim() || undefined, company: line.slice(comma + 1).trim() || undefined };
  }
  return { title: line.trim() || undefined };
}

/**
 * Split a trailing ", Place" from a company/institution string
 * ("BrightPixel Studio, Mumbai" -> company + location). Only when the tail
 * is short, digit-free, and month-free — employment locations stay inside
 * their entries and never become the candidate location.
 */
/**
 * Split a trailing ", Place" from a company/institution string
 * ("BrightPixel Studio, Mumbai" -> company + location). Only when the tail
 * is short, digit-free, and month-free — employment locations stay inside
 * their entries and never become the candidate location.
 */
function splitCompanyLocation(value: string | undefined): { company?: string; location?: string } {
  if (!value) return {};
  const m = value.match(/^(.*?),\s*([A-Za-z][A-Za-z .'\-&]{1,29})$/);
  if (!m || /\d/.test(m[2]) || MONTH_RE.test(m[2])) return { company: value };
  return { company: m[1].trim() || undefined, location: m[2].trim() };
}

function makeExperienceEntry(
  title: string | undefined,
  companyRaw: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
): Record<string, unknown> {
  const { company, location } = splitCompanyLocation(companyRaw);
  return {
    title,
    company,
    ...(location ? { location } : {}),
    startDate,
    endDate,
    description: '',
  };
}

/** Honors/distinction mentions ("with distinction", "CGPA 8.5"). */
function extractHonors(line: string): string | undefined {
  const m = line.match(/\b(with distinction|first class(?: with distinction)?|honou?rs?|magna cum laude|summa cum laude|cum laude|CGPA\s*[\d.]+(?:\/10)?|GPA\s*[\d.]+)\b/i);
  return m?.[0]?.trim() || undefined;
}

/** Flag records too thin to trust instead of filling them with fragments. */
function warnAmbiguousEntries(
  entries: Array<Record<string, unknown>>,
  field: 'experience' | 'education',
  warnings: AnalysisWarning[],
): void {
  const thin = entries.filter((e) => !e.title && !e.company && !e.institution && !e.degree);
  const dateless = entries.filter(
    (e) => !e.startDate && !e.endDate && (e.title || e.company || e.institution || e.degree),
  );
  if (thin.length > 0) {
    warnings.push({
      field,
      message: `${thin.length} ${field} block(s) had no recognizable title or institution and were kept as-is for review.`,
      severity: 'warning',
    });
  }
  if (dateless.length > 0) {
    warnings.push({
      field,
      message: `${dateless.length} ${field} record(s) have no dates; no dates were invented.`,
      severity: 'warning',
    });
  }
}

function extractExperienceEntries(lines: string[], warnings: AnalysisWarning[]): Array<Record<string, unknown>> {
  const experience: Array<Record<string, unknown>> = [];
  let current: Record<string, unknown> | null = null;
  // Title/company line awaiting its date line ("Senior UI Designer - X" then
  // "2022 - Present"). Designed layouts commonly split them across lines.
  let pendingTitle: string | null = null;
  const datePattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}\b/i;
  const flush = () => {
    if (!current) return;
    current.technologies = technologiesIn(`${current.title ?? ''} ${current.description ?? ''}`);
    experience.push(current);
    current = null;
  };
  for (const line of lines) {
    const hasDate = datePattern.test(line);
    if (isDateRangeLine(line)) {
      if (current && !(current.startDate ?? current.endDate)) {
        // Dates belong to the open entry (title came on previous lines).
        current.startDate = extractDate(line) ?? current.startDate;
        current.endDate = extractEndDate(line) ?? current.endDate;
      } else {
        flush();
        if (pendingTitle) {
          const { title, company } = splitTitleCompany(pendingTitle);
          current = makeExperienceEntry(title, company, extractDate(line), extractEndDate(line));
          pendingTitle = null;
        } else {
          const parts = line.split(/\s*[–—-]\s*/);
          current = makeExperienceEntry(parts[0]?.trim(), parts[1]?.trim(), extractDate(line), extractEndDate(line));
        }
      }
      continue;
    }
    if (hasDate && line.length > 5 && line.length < 200) {
      flush();
      const parts = line.split(/\s*[–—-]\s*/);
      current = makeExperienceEntry(parts[0]?.trim(), parts[1]?.trim(), extractDate(line), extractEndDate(line));
      pendingTitle = null;
    } else if (current && line.length > 10) {
      // A terse "Title - Company" line after a dated entry starts the next
      // entry (designed layouts list jobs this way); sentence-like lines
      // stay as description text.
      const dated = Boolean(current.startDate ?? current.endDate);
      if (dated && line.length < 120 && !hasDate && /\s[–—-]\s/.test(line) && !/[.!?]$/.test(line)) {
        flush();
        pendingTitle = line;
      } else {
        current.description = `${(current.description as string) || ''} ${line}`;
        pendingTitle = null;
      }
    } else if (!current && line.length > 2 && line.length < 120) {
      pendingTitle = line;
    }
  }
  flush();
  const deduped = dedupEntries(
    experience.slice(0, 10),
    (e) => [normKey(e.title), normKey(e.company), normKey(e.startDate), normKey(e.endDate)].join('|'),
    'experience',
    warnings,
  );
  warnAmbiguousEntries(deduped, 'experience', warnings);
  return deduped;
}

function extractInstitution(line: string): string | undefined {
  const cleaned = line.replace(/\s+\d{4}.*$/, '').trim();
  if (cleaned.length === 0 || cleaned.length > 100) return undefined;
  // Abbreviated institutes ("IIT Bombay", "NIFT Delhi").
  if (/\b(iit|nit|iiit|nift|nid|bits)\b/i.test(cleaned)) return cleaned;
  // Prefer the longest span ("National Institute of Design", not "Institute").
  const instMatch = cleaned.match(/\b[\w\s&.,'-]+(?:university|college|institute|school)\b[\w\s&.,'-]*/i) ||
    cleaned.match(/\b(?:university|college|institute|school)\s+of\s+[\w\s]+/i);
  return instMatch?.[0]?.trim() || undefined;
}

function extractDegree(line: string): string | undefined {
  const degMatch = line.match(/\b(?:bachelor|master|phd|ph\.d|doctorate|associate|diploma|certificate|b\.e\.?|m\.e\.?|b\.?des\.?|m\.?des\.?|b\.?tech\.?|m\.?tech\.?|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba)\b[\w\s.]*/i);
  return degMatch?.[0]?.trim() || undefined;
}

function extractFieldOfStudy(line: string): string | undefined {
  const fieldMatch = line.match(/(?:in|of)\s+([\w\s]+)(?:\s+\d{4}|$)/i);
  return fieldMatch?.[1]?.trim();
}

function extractEducationEntries(lines: string[], warnings: AnalysisWarning[]): Array<Record<string, unknown>> {
  const education: Array<Record<string, unknown>> = [];
  const degreePattern = /\b(?:bachelor|master|phd|ph\.d|doctorate|associate|diploma|certificate|b\.e\.?|m\.e\.?|b\.?des\.?|m\.?des\.?|b\.?tech\.?|m\.?tech\.?|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?|mba)\b/i;
  let current: Record<string, unknown> | null = null;
  for (const line of lines) {
    if (degreePattern.test(line) || (line.length > 5 && line.length < 200 && !current)) {
      if (current) education.push(current);
      const { company: institution, location } = splitCompanyLocation(extractInstitution(line) ?? undefined);
      current = {
        institution,
        ...(location ? { location } : {}),
        degree: extractDegree(line),
        fieldOfStudy: extractFieldOfStudy(line),
        honors: extractHonors(line),
        startDate: extractDate(line),
        endDate: extractEndDate(line),
      };
    } else if (current && line.length > 5) {
      // Fill structured fields from continuation lines before demoting the
      // line to free-text description (keeps dates/institutions queryable).
      if (!current.institution) {
        const { company: institution, location } = splitCompanyLocation(extractInstitution(line) ?? undefined);
        if (institution) current.institution = institution;
        if (location && !current.location) current.location = location;
      }
      if (!current.startDate) {
        const start = extractDate(line);
        if (start) current.startDate = start;
      }
      if (!current.endDate) {
        const end = extractEndDate(line);
        if (end) current.endDate = end;
      }
      if (!current.honors) {
        const honors = extractHonors(line);
        if (honors) current.honors = honors;
      }
      current.description = `${(current.description as string) || ''} ${line}`;
    }
  }
  if (current) education.push(current);
  warnAmbiguousEntries(education, 'education', warnings);
  // Per-entry coursework concepts evidenced in the entry's own text.
  const withCoursework = education.map((e) => {
    const coursework = technologiesIn(`${e.degree ?? ''} ${e.description ?? ''}`);
    return coursework.length > 0 ? { ...e, coursework } : e;
  });
  return dedupEntries(
    withCoursework.slice(0, 10),
    (e) => [normKey(e.institution), normKey(e.degree), normKey(e.startDate), normKey(e.endDate)].join('|'),
    'education',
    warnings,
  );
}

function extractOrg(text: string): string | undefined {
  const orgMatch = text.match(/\b(?:by|from|issued by)\s+([\w\s.]+)/i);
  return orgMatch?.[1]?.trim();
}

function extractCertifications(sectionText: string): Array<Record<string, unknown>> {
  const certs: Array<Record<string, unknown>> = [];
  for (const keyword of ['certification', 'certified', 'certificate', 'license']) {
    const regex = new RegExp(`\\b${keyword}\\b[^\\n]*`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sectionText)) !== null) {
      const certText = match[0].trim();
      if (certText.length > 5 && certText.length < 200) {
        certs.push({ name: certText, issuingOrganization: extractOrg(certText), confidence: 'uncertain' });
      }
    }
  }
  return certs.slice(0, 10);
}

/** Project blocks: a short title line followed by description lines. */
function extractProjectEntries(lines: string[]): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];
  let current: { name: string; description: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const description = current.description.join(' ');
    const urls = [...description.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?)]+$/, ''));
    entries.push({
      name: current.name,
      description,
      technologies: technologiesIn(`${current.name} ${description}`),
      projectUrl: urls[0],
      repositoryUrl: urls.find((u) => /github\.com/i.test(u)),
      confidence: 'uncertain',
    });
    current = null;
  };
  for (const line of lines) {
    const looksTitle = line.length < 70 && !/[.!?]$/.test(line) && !/^\d/.test(line);
    if (looksTitle && (!current || current.description.length > 0)) {
      flush();
      current = { name: line.replace(/^[-*•·\s]+/, '').trim(), description: [] };
    } else if (current) {
      current.description.push(line);
    } else {
      current = { name: line.slice(0, 70), description: [] };
    }
  }
  flush();
  return entries.slice(0, 10);
}

/**
 * Section-aware structured extraction shared by the PDF and DOCX parsers.
 * Deterministic: no AI calls, no network, no title/date/location guessing.
 */
export function extractStructuredResume(text: string): StructuredParse {
  const warnings: AnalysisWarning[] = [];
  // Raw lines go to the segmenter untouched: it performs gap-based
  // two-column recovery itself (plain-text only — no coordinates or OCR).
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const sections = segmentSections(lines);
  reconcileSkillLanguageLines(sections, warnings);
  // Same-name sections merge (a resume may have both "Industrial Training"
  // and "Experience", or repeated degree blocks): every same-name block is
  // parsed, never just the first.
  const linesOf = (name: SectionName): string[] => sections.filter((s) => s.name === name).flatMap((s) => s.lines);
  const textOf = (name: SectionName): string => linesOf(name).join('\n');
  const fullText = lines.join(' ');

  const reviewCandidates: ReviewCandidate[] = [];
  const skillsLines = linesOf('skills');
  const explicitSkills = skillsLines.length > 0 ? parseSkillsList(skillsLines, reviewCandidates, warnings) : [];
  const languageSkills = linesOf('languages').length > 0
    ? parseLanguagesSection(linesOf('languages'), reviewCandidates, warnings)
    : [];
  const courseworkSkills = linesOf('coursework').length > 0
    ? parseCourseworkLines(linesOf('coursework'), reviewCandidates, warnings)
    : [];

  // Supplement with dictionary evidence from experience, projects, summary,
  // and education. Coursework hits keep category 'coursework' so the importer
  // can exclude them from professional skills automatically.
  let skills = mergeSkills(explicitSkills, languageSkills);
  skills = mergeSkills(skills, courseworkSkills);
  const experienceText = textOf('experience');
  const projectsText = textOf('projects');
  const summaryText = textOf('summary');
  const educationText = textOf('education');
  if (experienceText) skills = mergeSkills(skills, matchDictionary(experienceText, 'experience'));
  if (projectsText) skills = mergeSkills(skills, matchDictionary(projectsText, 'projects'));
  if (summaryText) skills = mergeSkills(skills, matchDictionary(summaryText, 'summary'));
  if (educationText) skills = mergeSkills(skills, matchDictionary(educationText, 'education', { confidence: 'low' }));

  if (skills.length === 0 && reviewCandidates.length === 0) {
    warnings.push({
      field: 'skills',
      message: 'No verifiable skills were extracted. The Skills section may be missing or use unrecognized terms.',
      severity: 'warning',
    });
  }

  if (LOREM_RE.test(experienceText) || LOREM_RE.test(projectsText)) {
    warnings.push({
      field: 'experience',
      message: 'Experience or project descriptions contain placeholder (Lorem Ipsum) text; treat those entries as low-quality content.',
      severity: 'warning',
    });
  }

  const { links } = extractTypedLinks(fullText, warnings);

  const experience = extractExperienceEntries(linesOf('experience'), warnings);
  const education = extractEducationEntries(linesOf('education'), warnings);
  // Honors often sit beside (not inside) the degree block — e.g. after a
  // "Coursework:" line that routed to its own section. Attribute an
  // education-region honors mention to entries missing one; never invent.
  const regionHonors = extractHonors(`${textOf('education')} ${textOf('coursework')}`);
  if (regionHonors) {
    for (const entry of education) {
      if (!entry.honors) entry.honors = regionHonors;
    }
  }

  return {
    personal: extractContact(sections, fullText, warnings),
    summary: extractSummaryText(sections, warnings),
    skills,
    reviewCandidates,
    experience,
    education,
    certifications: extractCertifications(textOf('certifications')),
    projects: extractProjectEntries(linesOf('projects')),
    links,
    warnings,
  };
}

/** Parser version stamped on analyses written by the section-aware parser. */
export const PARSER_VERSION = '2.0.0';

/** Overall confidence from evidence — never from mere completion.
 *  Placeholder-heavy resumes are capped at 'low' no matter how many
 *  dictionary terms matched around the filler. */
export function overallConfidenceFromEvidence(parse: StructuredParse): SkillConfidence {
  const verified = parse.skills.length;
  const hasContact = Boolean(parse.personal.email || parse.personal.phone);
  const placeholderHeavy = parse.warnings.some((w) => /placeholder|lorem/i.test(w.message));
  if (placeholderHeavy) return verified >= 1 ? 'low' : 'uncertain';
  if (verified >= 3 && hasContact) return 'high';
  if (verified >= 1) return 'medium';
  if (parse.reviewCandidates.length > 0 || hasContact) return 'low';
  return 'uncertain';
}
