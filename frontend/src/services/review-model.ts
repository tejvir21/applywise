import type { CandidateProfile } from '@/services/profile'
import {
  importResumeToProfile,
  type ImportMode,
  type ResumeAnalysis,
  type ResumeImportResult,
} from '@/services/resumes'

/** Import preferences, scoped per resume ID by callers. */
export interface ImportPrefState {
  mode: ImportMode
  skillsMode: 'merge' | 'replace'
  fields: string[]
  removeSkills: string[]
}

export const DEFAULT_PREFS: ImportPrefState = {
  mode: 'fill',
  skillsMode: 'merge',
  fields: ['personal', 'summary', 'skills'],
  removeSkills: [],
}

export const IMPORT_FIELDS = ['personal', 'summary', 'skills', 'location', 'contact', 'links'] as const

export const IMPORT_MODES: Array<{ id: ImportMode; label: string; hint: string }> = [
  { id: 'fill', label: 'Fill empty', hint: 'Only fill empty fields. Never overwrite.' },
  { id: 'select', label: 'Selective update', hint: 'Replace only the field groups you select.' },
  { id: 'review', label: 'Review all changes', hint: 'Decide every change: keep, use proposed, or skip.' },
]

export function normText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export interface ScalarReviewRow {
  path: string
  group: string
  subkey: string
  label: string
  current: string
  proposed: string
  change: 'new' | 'update' | 'unchanged' | 'unsupported'
}

export interface StructuredSkillView {
  name: string
  confidence?: string
  evidence?: string
  section?: string
  method?: string
  reviewStatus?: string
  rating?: string
  category?: string
  proficiency?: string
  context?: string
}

export interface StructuredView {
  skills: StructuredSkillView[]
  reviewCandidates: Array<{ text: string; reason: string; section?: string }>
  personal: Record<string, string | undefined>
  links: Record<string, unknown>
}

export function structuredView(analysis: ResumeAnalysis): StructuredView {
  const sd = (analysis.structuredData ?? {}) as Record<string, unknown>
  const skills = Array.isArray(sd.skills) ? (sd.skills as StructuredView['skills']) : []
  const reviewCandidates = Array.isArray(sd.reviewCandidates)
    ? (sd.reviewCandidates as StructuredView['reviewCandidates'])
    : []
  const personal =
    sd.personal && typeof sd.personal === 'object'
      ? (sd.personal as Record<string, string | undefined>)
      : {}
  const links =
    sd.links && typeof sd.links === 'object' ? (sd.links as Record<string, unknown>) : {}
  return { skills, reviewCandidates, personal, links }
}

export function linkList(links: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['linkedin', 'github', 'portfolio', 'website']) {
    if (typeof links[key] === 'string' && links[key]) out.push(`${key}: ${links[key]}`)
  }
  if (Array.isArray(links.other)) {
    for (const url of links.other) {
      if (typeof url === 'string' && url) out.push(`other: ${url}`)
    }
  }
  return out
}

/** Human-readable extraction source: listed claims vs in-context mentions. */
export function methodLabel(method: string | undefined, section: string | undefined): string {
  if (method === 'skills_list') return 'Listed'
  if (method === 'review_approved') return 'Approved in review'
  if (method === 'dictionary_match') return `Mentioned in ${section ?? 'context'}`
  return method ?? 'extracted'
}

/** Mirror of the backend proposal rules (name split, placeholder guards, http URLs). */
export function buildScalarRows(
  analysis: ResumeAnalysis | null,
  profile: CandidateProfile | null | undefined,
): ScalarReviewRow[] {
  if (!analysis || analysis.status !== 'completed') return []
  const { personal, links } = structuredView(analysis)
  const sd = analysis.structuredData as Record<string, unknown>
  const rawSummary = typeof sd.summary === 'string' ? sd.summary : ''
  const summary = /lorem\s+ipsum/i.test(rawSummary) ? '' : rawSummary
  const locationBlocked = [personal.location, personal.city, personal.state, personal.country].some(
    (v) => v && /123\s+anywhere|any\s+city|\bST\s+12345\b/i.test(v),
  )
  const nameParts = (personal.name ?? '').split(' ').filter(Boolean)
  const httpLink = (value: unknown): string => {
    if (typeof value !== 'string' || !value) return ''
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
    } catch {
      return ''
    }
  }
  const social = (profile?.socialLinks ?? {}) as Record<string, unknown>
  const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value))

  const defs: Array<{ group: string; subkey: string; label: string; current: string; proposed: string }> = [
    { group: 'personal', subkey: 'firstName', label: 'First name', current: str(profile?.firstName), proposed: nameParts[0] ?? '' },
    { group: 'personal', subkey: 'lastName', label: 'Last name', current: str(profile?.lastName), proposed: nameParts.slice(1).join(' ') },
    { group: 'personal', subkey: 'email', label: 'Contact email', current: str(profile?.email), proposed: personal.email ?? '' },
    { group: 'personal', subkey: 'phone', label: 'Phone', current: str(profile?.phone), proposed: personal.phone ?? '' },
    { group: 'personal', subkey: 'location', label: 'Location', current: str(profile?.location), proposed: personal.location ?? '' },
    { group: 'summary', subkey: 'professionalSummary', label: 'Professional summary', current: str(profile?.professionalSummary), proposed: summary },
    { group: 'location', subkey: 'location', label: 'Location', current: str(profile?.location), proposed: locationBlocked ? '' : (personal.location ?? '') },
    { group: 'location', subkey: 'city', label: 'City', current: str(profile?.city), proposed: locationBlocked ? '' : (personal.city ?? '') },
    { group: 'location', subkey: 'state', label: 'State', current: str(profile?.state), proposed: locationBlocked ? '' : (personal.state ?? '') },
    { group: 'location', subkey: 'country', label: 'Country', current: str(profile?.country), proposed: locationBlocked ? '' : (personal.country ?? '') },
    { group: 'contact', subkey: 'email', label: 'Contact email', current: str(profile?.email), proposed: personal.email ?? '' },
    { group: 'contact', subkey: 'phone', label: 'Phone', current: str(profile?.phone), proposed: personal.phone ?? '' },
    { group: 'links', subkey: 'github', label: 'GitHub', current: str(social.github), proposed: httpLink(links.github) },
    { group: 'links', subkey: 'linkedin', label: 'LinkedIn', current: str(social.linkedin), proposed: httpLink(links.linkedin) },
    { group: 'links', subkey: 'portfolio', label: 'Portfolio', current: str(social.portfolio), proposed: httpLink(links.portfolio) },
    { group: 'links', subkey: 'website', label: 'Website', current: str(social.website), proposed: httpLink(links.website) },
  ]

  return defs.map((row) => {
    let change: ScalarReviewRow['change'] = 'unsupported'
    if (row.proposed !== '') {
      if (row.current === '') change = 'new'
      else if (normText(row.current) === normText(row.proposed)) change = 'unchanged'
      else change = 'update'
    }
    return { ...row, path: `${row.group}.${row.subkey}`, change }
  })
}

/** Expand selected groups to the subkey paths that have proposals. */
export function expandGroupsToPaths(groups: string[], rows: ScalarReviewRow[]): string[] {
  const byGroup = new Map<string, ScalarReviewRow[]>()
  for (const row of rows) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, [])
    byGroup.get(row.group)!.push(row)
  }
  const out: string[] = []
  for (const group of groups) {
    for (const row of byGroup.get(group) ?? []) {
      if (row.change === 'new' || row.change === 'update') out.push(row.path)
    }
  }
  return out
}

/** Existing skills that would disappear under the staged decisions. */
export function computeSkillRemovals(args: {
  existingNames: string[]
  stagedNew: string[]
  stagedApproved: string[]
  skillsMode: 'merge' | 'replace'
  removeSkills: string[]
}): string[] {
  const { existingNames, stagedNew, stagedApproved, skillsMode, removeSkills } = args
  const removals: string[] = []
  if (skillsMode === 'replace') {
    const keep = new Set(
      [...stagedNew, ...stagedApproved].map((n) => n.toLowerCase()),
    )
    for (const name of existingNames) {
      if (name && !keep.has(name.toLowerCase()) && !removals.includes(name)) removals.push(name)
    }
  }
  const lower = (s: string) => s.toLowerCase()
  for (const name of removeSkills) {
    const hit = existingNames.find((n) => lower(n) === lower(name))
    if (hit && !removals.includes(hit)) removals.push(hit)
  }
  return removals
}

/** Snapshot of current profile values for concurrency preconditions. */
export function buildExpectedSnapshot(profile: CandidateProfile | null | undefined): Record<string, unknown> {
  if (!profile) return {}
  const social = (profile.socialLinks ?? {}) as Record<string, unknown>
  return {
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    location: profile.location ?? null,
    city: profile.city ?? null,
    state: profile.state ?? null,
    country: profile.country ?? null,
    professionalSummary: profile.professionalSummary ?? null,
    github: (social.github as string | undefined) ?? null,
    linkedin: (social.linkedin as string | undefined) ?? null,
    portfolio: (social.portfolio as string | undefined) ?? null,
    website: (social.website as string | undefined) ?? null,
    other: Array.isArray(social.other) ? social.other : [],
    skills: (profile.skills ?? []).map((s) => s.name),
  }
}

export function proposedImportValues(
  field: string,
  analysis: ResumeAnalysis | null,
  rejected: string[],
  approved: string[] = [],
): string {
  if (!analysis || analysis.status !== 'completed') return 'Run analysis first to preview values.'
  const { skills, reviewCandidates, personal, links } = structuredView(analysis)
  const rejectedSet = new Set(rejected.map((r) => r.toLowerCase()))
  switch (field) {
    case 'personal': {
      const parts = [personal.name, personal.email, personal.phone, personal.location].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : 'Nothing extracted.'
    }
    case 'summary': {
      const raw = (analysis.structuredData as Record<string, unknown>).summary
      const summary = typeof raw === 'string' ? raw : ''
      return summary ? `${summary.slice(0, 120)}${summary.length > 120 ? '…' : ''}` : 'Nothing extracted.'
    }
    case 'skills': {
      const approvedSet = new Set(approved.map((r) => r.toLowerCase()))
      const usable = skills
        .filter((s) => (s.reviewStatus ?? 'verified') === 'verified' && !rejectedSet.has(s.name.toLowerCase()))
        .map((s) => s.name)
      const approvedTerms = reviewCandidates
        .map((r) => r.text)
        .filter((t) => approvedSet.has(t.toLowerCase()) && !rejectedSet.has(t.toLowerCase()))
      const all = [...usable, ...approvedTerms.map((t) => `${t} (review-approved)`)]
      const held = reviewCandidates.length - approvedTerms.length
      if (all.length === 0) return 'No verified skills to import.'
      return `${all.join(', ')}${held > 0 ? ` (${held} uncertain term${held === 1 ? '' : 's'} held for review, never auto-imported)` : ''}`
    }
    case 'location': {
      const parts = [personal.location, personal.city, personal.state, personal.country].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : 'Nothing extracted.'
    }
    case 'contact': {
      const parts = [personal.email, personal.phone].filter(Boolean)
      return parts.length > 0 ? parts.join(' · ') : 'Nothing extracted.'
    }
    case 'links': {
      const list = linkList(links)
      return list.length > 0 ? list.join(' · ') : 'Nothing extracted.'
    }
    default:
      return ''
  }
}

export function formatImportResult(
  result: ResumeImportResult,
  excludeSkills: string[],
): string {
  const applied = result.applied ?? []
  const removed = result.removed ?? []
  const parts: string[] = []
  if (result.imported.length > 0) parts.push(`Imported: ${result.imported.join(', ')}.`)
  if (applied.length > 0) parts.push(`Applied: ${applied.join(', ')}.`)
  if (result.skipped.length > 0) parts.push(`Skipped: ${result.skipped.join(', ')}.`)
  if (result.conflicts.length > 0) {
    parts.push(`Already set (kept your profile values): ${result.conflicts.join('; ')}.`)
  }
  if (removed.length > 0) parts.push(`Removed skills: ${removed.join(', ')}.`)
  if (excludeSkills.length > 0) {
    parts.push(`Excluded by your review: ${excludeSkills.join(', ')}.`)
  }
  return parts.join(' ') || 'Import finished with no changes.'
}

export interface ImportRunInput {
  resumeId: string
  mode: ImportMode
  /** Selected groups (select mode) — expanded internally. */
  fields: string[]
  /** Checked subkey paths (review mode). Defaults to new/updated rows. */
  checks?: string[]
  prefs: ImportPrefState
  analysis: ResumeAnalysis | null
  profile: CandidateProfile | null | undefined
  rejected: string[]
  approved: string[]
  confirmFn: (lines: string[]) => boolean
}

export type ImportRunOutcome =
  | { kind: 'noop'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'done'; resultText: string }

/**
 * Shared import orchestration (fill / selective / review). Computes the
 * staged field set, asks for confirmation only when destructive changes are
 * staged, submits solely approved changes with concurrency preconditions,
 * and formats the result. Throws service errors for callers to display.
 */
export async function runResumeImport(input: ImportRunInput): Promise<ImportRunOutcome> {
  const { resumeId, mode, fields, prefs, analysis, profile, rejected, approved, confirmFn } = input
  const rejectedList = rejected
  const approvedList = approved

  if (mode === 'fill') {
    if (fields.length === 0) return { kind: 'noop', message: 'Select at least one field to import.' }
    const result = await importResumeToProfile(resumeId, fields, {
      excludeSkills: rejectedList,
      includeReview: approvedList,
      mode: 'fill',
    })
    return { kind: 'done', resultText: formatImportResult(result, rejectedList) }
  }

  // Selective update / review-all-changes: only explicitly approved rows.
  const rows = buildScalarRows(analysis, profile)
  const rowsByPath = new Map(rows.map((r) => [r.path, r]))
  const defaultChecks = rows.filter((r) => r.change === 'new' || r.change === 'update').map((r) => r.path)
  const checkedPaths = mode === 'review' ? (input.checks ?? defaultChecks) : expandGroupsToPaths(fields, rows)
  const checked = checkedPaths.filter((p) => {
    const row = rowsByPath.get(p)
    return row && row.change !== 'unsupported' && row.change !== 'unchanged'
  })
  const { skills: verified } = analysis ? structuredView(analysis) : { skills: [] as StructuredSkillView[] }
  const rejectedSet = new Set(rejectedList.map((r) => r.toLowerCase()))
  const approvedSet = new Set(approvedList.map((r) => r.toLowerCase()))
  const stagedNew = verified
    .filter((s) => (s.reviewStatus ?? 'verified') === 'verified' && !rejectedSet.has(s.name.toLowerCase()))
    .map((s) => s.name)
  const stagedApproved = (analysis ? structuredView(analysis).reviewCandidates : [])
    .map((r) => r.text)
    .filter((t) => approvedSet.has(t.toLowerCase()) && !rejectedSet.has(t.toLowerCase()))
  const existingNames = (profile?.skills ?? []).map((s) => s.name)
  const skillsStaged =
    stagedNew.length > 0 ||
    stagedApproved.length > 0 ||
    prefs.skillsMode === 'replace' ||
    prefs.removeSkills.length > 0
  const stagedFields = [...new Set([...checked.map((p) => p.split('.')[0]), ...(skillsStaged ? ['skills'] : [])])]
  if (stagedFields.length === 0 && !skillsStaged) {
    return { kind: 'noop', message: 'Select at least one change to import.' }
  }

  // Destructive preview: populated targets that differ + removals.
  const destructive: string[] = []
  for (const path of checked) {
    const row = rowsByPath.get(path)
    if (row && row.change === 'update') destructive.push(`${row.label}: “${row.current}” → “${row.proposed}”`)
  }
  const removals = computeSkillRemovals({
    existingNames,
    stagedNew,
    stagedApproved,
    skillsMode: prefs.skillsMode,
    removeSkills: prefs.removeSkills,
  })
  for (const name of removals) destructive.push(`Remove skill: ${name}`)
  if (destructive.length > 0 && !confirmFn(destructive)) {
    return { kind: 'cancelled' }
  }

  const expected = buildExpectedSnapshot(profile)
  const result = await importResumeToProfile(resumeId, stagedFields, {
    excludeSkills: rejectedList,
    includeReview: approvedList,
    mode,
    skillsMode: prefs.skillsMode,
    removeSkills: prefs.removeSkills,
    expected,
    confirmReplace: destructive.length > 0,
  })
  return { kind: 'done', resultText: formatImportResult(result, rejectedList) }
}
