import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useHealth } from '@/hooks/useHealth'
import { useProfile } from '@/hooks/useProfile'
import { useResumes } from '@/hooks/useResumes'
import { resumeErrorMessage } from '@/services/resume-errors'
import type { CandidateProfile } from '@/services/profile'
import {
  analyzeResume,
  deleteResume,
  downloadResumeFile,
  getResumeAnalysis,
  importResumeToProfile,
  retryResumeAnalysis,
  setDefaultResume,
  uploadResume,
  type ImportMode,
  type ResumeAnalysis,
  type ResumeImportResult,
} from '@/services/resumes'

const MAX_SIZE_BYTES = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx']
const ACCEPT_ATTR = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const IMPORT_FIELDS = ['personal', 'summary', 'skills', 'location', 'contact', 'links'] as const

const IMPORT_MODES: Array<{ id: ImportMode; label: string; hint: string }> = [
  { id: 'fill', label: 'Fill empty', hint: 'Only fill empty fields. Never overwrite.' },
  { id: 'select', label: 'Selective update', hint: 'Replace only the field groups you select.' },
  { id: 'review', label: 'Review all changes', hint: 'Decide every change: keep, use proposed, or skip.' },
]

interface ImportPrefState {
  mode: ImportMode
  skillsMode: 'merge' | 'replace'
  fields: string[]
  removeSkills: string[]
}

const DEFAULT_PREFS: ImportPrefState = {
  mode: 'fill',
  skillsMode: 'merge',
  fields: ['personal', 'summary', 'skills'],
  removeSkills: [],
}

const IMPORT_PREFS_KEY = 'applywise-import-prefs'

function loadImportPrefs(): Record<string, ImportPrefState> {
  try {
    const raw = window.localStorage.getItem(IMPORT_PREFS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, ImportPrefState> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const v = value as Record<string, unknown>
      out[key] = {
        mode: v.mode === 'select' || v.mode === 'review' ? v.mode : 'fill',
        skillsMode: v.skillsMode === 'replace' ? 'replace' : 'merge',
        fields: Array.isArray(v.fields) ? v.fields.filter((f): f is string => typeof f === 'string') : [...DEFAULT_PREFS.fields],
        removeSkills: Array.isArray(v.removeSkills) ? v.removeSkills.filter((f): f is string => typeof f === 'string') : [],
      }
    }
    return out
  } catch {
    return {}
  }
}

function normText(value: unknown): string {
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

/** Mirror of the backend proposal rules (name split, placeholder guards, http URLs). */
function buildScalarRows(
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
function expandGroupsToPaths(groups: string[], rows: ScalarReviewRow[]): string[] {
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
function computeSkillRemovals(args: {
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
function buildExpectedSnapshot(profile: CandidateProfile | null | undefined): Record<string, unknown> {
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

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

/** Client-side gate: extension plus size. Content is validated by the server. */
function validateClientFile(file: File): string | null {
  if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'Unsupported file type. Only PDF (.pdf) and DOCX (.docx) are accepted.'
  }
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_SIZE_BYTES) {
    return `File exceeds the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB). Choose a smaller file.`
  }
  return null
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

const REJECTED_STORAGE_KEY = 'applywise-review-rejected'
const APPROVED_STORAGE_KEY = 'applywise-review-approved'

function loadStringMap(key: string): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string[]> = {}
    for (const [k, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[k] = value.filter((v): v is string => typeof v === 'string')
      }
    }
    return out
  } catch {
    return {}
  }
}

function loadRejected(): Record<string, string[]> {
  return loadStringMap(REJECTED_STORAGE_KEY)
}

function loadApproved(): Record<string, string[]> {
  return loadStringMap(APPROVED_STORAGE_KEY)
}

function skillNames(analysis: ResumeAnalysis): string[] {
  const skills = (analysis.structuredData as { skills?: Array<{ name?: string }> })?.skills
  if (!Array.isArray(skills)) return []
  return skills.map((s) => s?.name).filter((n): n is string => typeof n === 'string' && n.length > 0)
}

type StructuredView = {
  skills: Array<{
    name: string
    confidence?: string
    evidence?: string
    section?: string
    method?: string
    reviewStatus?: string
    rating?: string
    category?: string
    proficiency?: string
  }>
  reviewCandidates: Array<{ text: string; reason: string; section?: string }>
  personal: Record<string, string | undefined>
  links: Record<string, unknown>
}

/** Human-readable extraction source: listed claims vs in-context mentions. */
function methodLabel(method: string | undefined, section: string | undefined): string {
  if (method === 'skills_list') return 'Listed'
  if (method === 'review_approved') return 'Approved in review'
  if (method === 'dictionary_match') return `Mentioned in ${section ?? 'context'}`
  return method ?? 'extracted'
}

function structuredView(analysis: ResumeAnalysis): StructuredView {
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

function linkList(links: Record<string, unknown>): string[] {
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

function proposedImportValues(
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

function StorageStatusLine() {
  const { data } = useHealth()
  const storage = data?.storage
  if (!storage) return null
  return (
    <p className="mb-4 text-xs text-slate-500">
      Storage: {storage.active}
      {storage.healthy ? '' : ' (currently unavailable)'}
      {' · '}status snapshot only — it does not confirm any individual upload.
    </p>
  )
}

type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; analysis: ResumeAnalysis }
  | { kind: 'error'; message: string }

function AnalysisDetails({
  analysis,
  rejected,
  approved,
  onToggleReject,
  onToggleApprove,
}: {
  analysis: ResumeAnalysis
  rejected: string[]
  approved: string[]
  onToggleReject: (name: string) => void
  onToggleApprove: (name: string) => void
}) {
  const { skills, reviewCandidates, personal, links } = structuredView(analysis)
  const rejectedSet = new Set(rejected.map((r) => r.toLowerCase()))
  const approvedSet = new Set(approved.map((r) => r.toLowerCase()))
  const verified = skills.filter((s) => (s.reviewStatus ?? 'verified') === 'verified')
  const contactParts = [personal.name, personal.email, personal.phone].filter(Boolean)
  const locationParts = [personal.location, personal.city, personal.state, personal.country].filter(
    Boolean,
  )
  const linkEntries = linkList(links)

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-600">
        Extraction confidence (evidence-based, not completion-based):{' '}
        <span className="font-medium">{analysis.confidence ?? 'unknown'}</span>
      </p>

      {verified.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-slate-700">Verified skills ({verified.length})</p>
          <ul aria-label="Verified extracted skills" className="mt-1 space-y-1.5">
            {verified.map((skill) => {
              const isRejected = rejectedSet.has(skill.name.toLowerCase())
              return (
                <li key={skill.name} className="text-xs text-slate-700">
                  <span className={isRejected ? 'line-through' : 'font-medium'}>{skill.name}</span>{' '}
                  {skill.category && (
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {skill.category}
                    </span>
                  )}{' '}
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                    proficiency: not specified
                  </span>{' '}
                  {skill.rating && (
                    <span
                      className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800"
                      title="Rating printed on the resume itself — evidence, not an assessed proficiency level."
                    >
                      stated: {skill.rating}
                    </span>
                  )}{' '}
                  {skill.proficiency && (
                    <span
                      className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800"
                      title="Proficiency exactly as stated on the resume — never mapped to a profile level."
                    >
                      stated proficiency: {skill.proficiency}
                    </span>
                  )}{' '}
                  <button
                    type="button"
                    aria-label={`${isRejected ? 'Restore' : 'Reject'} skill ${skill.name}`}
                    onClick={() => onToggleReject(skill.name)}
                    className="ml-1 text-[11px] text-brand-700 underline"
                  >
                    {isRejected ? 'Restore' : 'Reject'}
                  </button>
                  {skill.evidence && (
                    <span className="block text-[11px] text-slate-500">
                      Evidence ({methodLabel(skill.method, skill.section)}): “{skill.evidence}”
                    </span>
                  )}
                  {isRejected && (
                    <span className="block text-[11px] text-amber-700">
                      Rejected — excluded from import.
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-slate-600">No verified skills extracted.</p>
      )}

      {reviewCandidates.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-800">
            Needs review ({reviewCandidates.length}) — never auto-imported
          </p>
          <ul aria-label="Skills needing review" className="mt-1 space-y-1.5">
            {reviewCandidates.map((candidate) => {
              const isRejected = rejectedSet.has(candidate.text.toLowerCase())
              const isApproved = approvedSet.has(candidate.text.toLowerCase())
              return (
                <li key={candidate.text} className="text-xs text-slate-700">
                  <span className={isRejected ? 'line-through' : ''}>“{candidate.text}”</span>{' '}
                  <span className="text-[11px] text-slate-500">— {candidate.reason}</span>{' '}
                  <button
                    type="button"
                    aria-label={`${isRejected ? 'Restore' : 'Reject'} candidate ${candidate.text}`}
                    onClick={() => onToggleReject(candidate.text)}
                    className="ml-1 text-[11px] text-brand-700 underline"
                  >
                    {isRejected ? 'Restore' : 'Reject'}
                  </button>{' '}
                  {!isRejected && (
                    <button
                      type="button"
                      aria-label={`${isApproved ? 'Unapprove' : 'Approve'} candidate ${candidate.text} for import`}
                      onClick={() => onToggleApprove(candidate.text)}
                      className="ml-1 text-[11px] text-brand-700 underline"
                    >
                      {isApproved ? 'Unapprove' : 'Approve for import'}
                    </button>
                  )}
                  {isApproved && !isRejected && (
                    <span className="block text-[11px] text-emerald-700">
                      Approved — imports only with your explicit approval, never automatically.
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {(contactParts.length > 0 || locationParts.length > 0 || linkEntries.length > 0) && (
        <div className="text-xs text-slate-600">
          <p className="font-medium text-slate-700">Extracted contact & links</p>
          {contactParts.length > 0 && <p>Contact: {contactParts.join(' · ')}</p>}
          {locationParts.length > 0 && (
            <p>
              Location: {locationParts.join(' · ')}
              {personal.locationEvidence ? ` (as written: “${personal.locationEvidence}”)` : ''}
            </p>
          )}
          {linkEntries.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {linkEntries.map((entry) => (
                <li key={entry} className="break-all">{entry}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {analysis.warnings.length > 0 && (
        <ul aria-label="Parsing warnings" className="space-y-1">
          {analysis.warnings.map((warning, index) => (
            <li key={`${warning.field}-${index}`} className="text-[11px] text-amber-800">
              {warning.field}: {warning.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CHANGE_BADGE: Record<ScalarReviewRow['change'], string> = {
  new: 'bg-emerald-100 text-emerald-800',
  update: 'bg-amber-100 text-amber-800',
  unchanged: 'bg-slate-100 text-slate-600',
  unsupported: 'bg-slate-100 text-slate-400',
}

function ImportPanelBody(props: {
  analysis: ResumeAnalysis | null
  profile: CandidateProfile | null | undefined
  profileUnknown: boolean
  prefs: ImportPrefState
  onPrefs: (patch: Partial<ImportPrefState>) => void
  scalarRows: ScalarReviewRow[]
  checks: string[]
  onToggleReviewCheck: (path: string, base: string[]) => void
  rejected: string[]
  approved: string[]
  onToggleReject: (name: string) => void
  removeSkills: string[]
  onToggleRemoveSkill: (name: string) => void
  busy: boolean
  onImport: () => void
  onCancel: () => void
  importResult: string | null
}) {
  const {
    analysis, profile, profileUnknown, prefs, onPrefs, scalarRows, checks,
    onToggleReviewCheck, rejected, approved, onToggleReject,
    removeSkills, onToggleRemoveSkill, busy, onImport, onCancel, importResult,
  } = props
  const completed = analysis?.status === 'completed'
  const { skills, reviewCandidates } = analysis ? structuredView(analysis) : { skills: [], reviewCandidates: [] }
  const rejectedSet = new Set(rejected.map((r) => r.toLowerCase()))
  const approvedSet = new Set(approved.map((r) => r.toLowerCase()))
  const verifiedNew = (skills as Array<{ name: string; reviewStatus?: string; category?: string }>).filter(
    (s) => (s.reviewStatus ?? 'verified') === 'verified' && !rejectedSet.has(s.name.toLowerCase()),
  )
  const approvedTerms = reviewCandidates
    .map((r) => r.text)
    .filter((t) => approvedSet.has(t.toLowerCase()) && !rejectedSet.has(t.toLowerCase()))
  const existingNames = (profile?.skills ?? []).map((s) => s.name)
  const removeSet = new Set(removeSkills.map((s) => s.toLowerCase()))
  const removals = computeSkillRemovals({
    existingNames,
    stagedNew: verifiedNew.map((s) => s.name),
    stagedApproved: approvedTerms,
    skillsMode: prefs.skillsMode,
    removeSkills,
  })
  const courseworkCount = (skills as Array<{ category?: string }>).filter((s) => s.category === 'coursework').length

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium text-slate-700">
        Import parsed data into your profile. Rejected review items are excluded. Nothing is overwritten
        without your explicit approval.
      </p>

      <div role="radiogroup" aria-label="Import mode" className="mt-2 flex flex-wrap gap-3">
        {IMPORT_MODES.map((mode) => (
          <label key={mode.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700" title={mode.hint}>
            <input
              type="radio"
              name={`import-mode-${mode.id}`}
              checked={prefs.mode === mode.id}
              disabled={busy}
              onChange={() => onPrefs({ mode: mode.id })}
            />
            <span className="font-medium">{mode.label}</span>
          </label>
        ))}
      </div>

      {prefs.mode === 'fill' && (
        <div className="mt-2 space-y-2">
          {IMPORT_FIELDS.map((field) => (
            <label key={field} className="block text-xs text-slate-700">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={prefs.fields.includes(field)}
                  disabled={busy}
                  onChange={() => {
                    const fields = prefs.fields.includes(field)
                      ? prefs.fields.filter((f) => f !== field)
                      : [...prefs.fields, field]
                    onPrefs({ fields })
                  }}
                />
                {field}
              </span>
              <span className="block pl-5 text-[11px] text-slate-500">
                Proposed: {proposedImportValues(field, analysis, rejected, approved)}
              </span>
            </label>
          ))}
        </div>
      )}

      {prefs.mode === 'select' && (
        <div className="mt-2 space-y-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field} className="text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5 font-medium">
                <input
                  type="checkbox"
                  checked={prefs.fields.includes(field)}
                  disabled={busy}
                  onChange={() => {
                    const fields = prefs.fields.includes(field)
                      ? prefs.fields.filter((f) => f !== field)
                      : [...prefs.fields, field]
                    onPrefs({ fields })
                  }}
                />
                {field}
              </label>
              {prefs.fields.includes(field) && (
                <ul className="mt-1 space-y-0.5 pl-5 text-[11px] text-slate-600">
                  {scalarRows
                    .filter((r) => r.group === field)
                    .map((row) => (
                      <li key={row.path}>
                        {row.label}: {row.current === '' ? <em>empty</em> : `“${row.current}”`} →{' '}
                        {row.proposed === '' ? <em>no value</em> : `“${row.proposed}”`}{' '}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${CHANGE_BADGE[row.change]}`}>
                          {row.change}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {prefs.mode === 'review' && (
        <div className="mt-2">
          {profileUnknown && (
            <p className="mb-2 text-[11px] text-amber-700">
              Current profile values are unavailable; all comparisons show proposed values only.
            </p>
          )}
          <ul className="space-y-1.5">
            {scalarRows.map((row) => {
              const checked = checks.includes(row.path)
              const usable = row.change === 'new' || row.change === 'update'
              return (
                <li key={row.path} className="flex flex-wrap items-start gap-2 text-xs text-slate-700">
                  <label className="inline-flex min-w-0 flex-1 items-start gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || !usable}
                      onChange={() => onToggleReviewCheck(row.path, checks)}
                      aria-label={`Use proposed ${row.label}`}
                    />
                    <span>
                      <span className="font-medium">{row.label}</span>{' '}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${CHANGE_BADGE[row.change]}`}>
                        {row.change}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Current: {row.current === '' ? <em>empty</em> : `“${row.current}”`}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Proposed: {row.proposed === '' ? <em>no value</em> : `“${row.proposed}”`}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {prefs.mode !== 'fill' && completed && (
        <div className="mt-3 rounded-md border border-slate-200 bg-white px-2.5 py-2">
          <p className="text-xs font-medium text-slate-700">Skills: merge, replace, or review individually</p>
          <div role="radiogroup" aria-label="Skills mode" className="mt-1.5 flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700" title="Add new skills, keep everything already on your profile.">
              <input
                type="radio"
                name="skills-mode-merge"
                checked={prefs.skillsMode === 'merge'}
                disabled={busy}
                onChange={() => onPrefs({ skillsMode: 'merge' })}
              />
              Merge
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700" title="Replace your whole skill list with the approved resume skills. Removed skills are shown before you confirm.">
              <input
                type="radio"
                name="skills-mode-replace"
                checked={prefs.skillsMode === 'replace'}
                disabled={busy}
                onChange={() => onPrefs({ skillsMode: 'replace' })}
              />
              Replace
            </label>
          </div>

          {verifiedNew.length > 0 && (
            <ul aria-label="New skills to import" className="mt-2 space-y-1">
              {verifiedNew.map((skill) => (
                <li key={skill.name} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={!rejectedSet.has(skill.name.toLowerCase())}
                    disabled={busy}
                    onChange={() => onToggleReject(skill.name)}
                    aria-label={`Include new skill ${skill.name}`}
                  />
                  <span>
                    <span className="font-medium">{skill.name}</span>
                    {skill.category && <span className="text-[11px] text-slate-500"> ({skill.category})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {approvedTerms.length > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-600">
              Review-approved to import: {approvedTerms.join(', ')}.
            </p>
          )}
          {courseworkCount > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              {courseworkCount} coursework item{courseworkCount === 1 ? '' : 's'} never auto-import
              as professional skills.
            </p>
          )}

          {existingNames.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-700">Existing profile skills</p>
              <ul aria-label="Existing profile skills" className="mt-1 space-y-1">
                {existingNames.map((name) => (
                  <li key={name} className="flex items-start gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={removeSet.has(name.toLowerCase())}
                      disabled={busy}
                      onChange={() => onToggleRemoveSkill(name)}
                      aria-label={`Remove existing skill ${name}`}
                    />
                    <span className={removeSet.has(name.toLowerCase()) ? 'line-through' : ''}>{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prefs.skillsMode === 'replace' && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800" role="alert">
              {removals.length > 0
                ? `Replace will remove: ${removals.join(', ')}. This needs your final confirmation.`
                : 'Replace mode: your current list already matches the approved resume skills.'}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onImport}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Import to profile
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {importResult && (
        <p role="status" className="mt-2 text-xs text-slate-700">
          {importResult}
        </p>
      )}
    </div>
  )
}

export function ResumesPage() {
  const queryClient = useQueryClient()
  const resumesQuery = useResumes()
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, AnalysisState>>({})
  const [importOpenId, setImportOpenId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importPrefs, setImportPrefs] = useState<Record<string, ImportPrefState>>(() => loadImportPrefs())
  /** Review-mode per-row approvals, keyed by resume id then subkey path. */
  const [reviewChecks, setReviewChecks] = useState<Record<string, string[]>>({})
  const profileQuery = useProfile()
  /** Review rejections per resume: skill/candidate names excluded from import.
   *  Persisted in localStorage so reject/restore survives reloads and
   *  re-analysis (re-analysis updates the analysis record in place under the
   *  same resume id, so the stored rejections still apply). */
  const [rejected, setRejected] = useState<Record<string, string[]>>(() =>
    loadRejected(),
  )
  /** Explicitly approved review terms per resume: imported only on approval. */
  const [approved, setApproved] = useState<Record<string, string[]>>(() =>
    loadApproved(),
  )
  useEffect(() => {
    try {
      window.localStorage.setItem(REJECTED_STORAGE_KEY, JSON.stringify(rejected))
    } catch {
      // Private-mode storage failures must not break the page.
    }
  }, [rejected])
  useEffect(() => {
    try {
      window.localStorage.setItem(APPROVED_STORAGE_KEY, JSON.stringify(approved))
    } catch {
      // Private-mode storage failures must not break the page.
    }
  }, [approved])
  useEffect(() => {
    try {
      window.localStorage.setItem(IMPORT_PREFS_KEY, JSON.stringify(importPrefs))
    } catch {
      // Private-mode storage failures must not break the page.
    }
  }, [importPrefs])
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['resumes'] })
  }

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null)
      return
    }
    const problem = validateClientFile(next)
    if (problem) {
      setFile(null)
      setError(problem)
      return
    }
    setError(null)
    setFile(next)
  }

  async function onUpload(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!file) {
      setError('Choose a PDF or DOCX file first.')
      return
    }
    const problem = validateClientFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setNotice(null)
    setImportResult(null)
    setBusy(true)
    setBusyLabel('Uploading…')
    try {
      const result = await uploadResume(file)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setNotice(`Uploaded ${result.resume.originalFilename}. Analysis queued.`)
      await refresh()
    } catch (err) {
      setError(`Upload failed: ${resumeErrorMessage(err, 'Upload')}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function run(label: string, doneMessage: string, fn: () => Promise<unknown>) {
    if (busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    setBusyLabel(`${label}…`)
    try {
      await fn()
      setNotice(doneMessage)
      await refresh()
    } catch (err) {
      setError(`${label} failed: ${resumeErrorMessage(err, label)}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function loadAnalysis(id: string) {
    setAnalyses((prev) => ({ ...prev, [id]: { kind: 'loading' } }))
    try {
      const analysis = await getResumeAnalysis(id)
      setAnalyses((prev) => ({ ...prev, [id]: { kind: 'ready', analysis } }))
    } catch (err) {
      setAnalyses((prev) => ({
        ...prev,
        [id]: { kind: 'error', message: resumeErrorMessage(err, 'Load analysis') },
      }))
    }
  }

  async function onAnalyze(id: string) {
    if (busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    setBusyLabel('Analyzing…')
    try {
      await analyzeResume(id)
      const analysis = await getResumeAnalysis(id)
      setAnalyses((prev) => ({ ...prev, [id]: { kind: 'ready', analysis } }))
      setNotice('Analysis completed.')
      await refresh()
    } catch (err) {
      // A 422 here is a parsing failure, not an upload failure: surface the
      // failed analysis (with server warnings) when one exists.
      try {
        const analysis = await getResumeAnalysis(id)
        setAnalyses((prev) => ({ ...prev, [id]: { kind: 'ready', analysis } }))
      } catch {
        // Keep the action error below when no analysis record is readable.
      }
      setError(`Analysis failed: ${resumeErrorMessage(err, 'Analysis')}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function onRetry(id: string) {
    if (busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    setBusyLabel('Retrying analysis…')
    try {
      await retryResumeAnalysis(id)
      const analysis = await getResumeAnalysis(id)
      setAnalyses((prev) => ({ ...prev, [id]: { kind: 'ready', analysis } }))
      setNotice('Analysis completed.')
      await refresh()
    } catch (err) {
      setError(`Retry failed: ${resumeErrorMessage(err, 'Retry')}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  async function onDownload(id: string, fallbackName: string) {
    if (busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    setBusyLabel('Preparing download…')
    try {
      const { blob, filename } = await downloadResumeFile(id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || fallbackName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`Downloaded ${filename || fallbackName}.`)
    } catch (err) {
      setError(`Download failed: ${resumeErrorMessage(err, 'Download')}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  function prefsFor(resumeId: string): ImportPrefState {
    return importPrefs[resumeId] ?? DEFAULT_PREFS
  }

  function patchPrefs(resumeId: string, patch: Partial<ImportPrefState>) {
    setImportPrefs((prev) => ({ ...prev, [resumeId]: { ...prefsFor(resumeId), ...prev[resumeId], ...patch } }))
  }

  function toggleReviewCheck(resumeId: string, path: string, base: string[]) {
    setReviewChecks((prev) => {
      const current = prev[resumeId] ?? base
      return {
        ...prev,
        [resumeId]: current.includes(path) ? current.filter((p) => p !== path) : [...current, path],
      }
    })
  }

  function toggleRemoveSkill(resumeId: string, name: string) {
    const prefs = prefsFor(resumeId)
    const lower = name.toLowerCase()
    const current = prefs.removeSkills
    patchPrefs(resumeId, {
      removeSkills: current.some((n) => n.toLowerCase() === lower)
        ? current.filter((n) => n.toLowerCase() !== lower)
        : [...current, name],
    })
  }

  async function onImport(id: string) {
    if (busy) return
    const prefs = prefsFor(id)
    const analysisState = analyses[id]
    const analysis = analysisState?.kind === 'ready' ? analysisState.analysis : null
    const profile = profileQuery.data ?? null
    const rejectedList = rejected[id] ?? []
    const approvedList = approved[id] ?? []

    if (prefs.mode === 'fill') {
      if (prefs.fields.length === 0) {
        setError('Select at least one field to import.')
        return
      }
      setError(null)
      setNotice(null)
      setImportResult(null)
      setBusy(true)
      setBusyLabel('Importing…')
      try {
        const excludeSkills = rejectedList
        const includeReview = approvedList
        const result = await importResumeToProfile(id, prefs.fields, { excludeSkills, includeReview, mode: 'fill' })
        setImportResult(formatImportResult(result, excludeSkills))
        await refresh()
        await queryClient.invalidateQueries({ queryKey: ['profile'] })
      } catch (err) {
        setError(`Import failed: ${resumeErrorMessage(err, 'Import')}`)
      } finally {
        setBusy(false)
        setBusyLabel(null)
      }
      return
    }

    // Selective update / review-all-changes: only explicitly approved rows.
    const rows = buildScalarRows(analysis, profile)
    const rowsByPath = new Map(rows.map((r) => [r.path, r]))
    const checkedPaths =
      prefs.mode === 'review'
        ? (reviewChecks[id] ?? rows.filter((r) => r.change === 'new' || r.change === 'update').map((r) => r.path))
        : expandGroupsToPaths(prefs.fields, rows)
    const checked = checkedPaths.filter((p) => {
      const row = rowsByPath.get(p)
      return row && row.change !== 'unsupported' && row.change !== 'unchanged'
    })
    const { skills: verified } = analysis ? structuredView(analysis) : { skills: [] as never[] }
    const rejectedSet = new Set(rejectedList.map((r) => r.toLowerCase()))
    const approvedSet = new Set(approvedList.map((r) => r.toLowerCase()))
    const stagedNew = (verified as Array<{ name: string; reviewStatus?: string }>)
      .filter((s) => (s.reviewStatus ?? 'verified') === 'verified' && !rejectedSet.has(s.name.toLowerCase()))
      .map((s) => s.name)
    const stagedApproved = (analysis ? structuredView(analysis).reviewCandidates : [])
      .map((r) => r.text)
      .filter((t) => approvedSet.has(t.toLowerCase()) && !rejectedSet.has(t.toLowerCase()))
    const existingNames = (profile?.skills ?? []).map((s) => s.name)
    const skillsStaged = stagedNew.length > 0 || stagedApproved.length > 0 || prefs.skillsMode === 'replace' || prefs.removeSkills.length > 0
    const fields = [...new Set([...checked.map((p) => p.split('.')[0]), ...(skillsStaged ? ['skills'] : [])])]
    if (fields.length === 0 && !skillsStaged) {
      setError('Select at least one change to import.')
      return
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
    if (destructive.length > 0) {
      const ok = window.confirm(
        `This will overwrite profile data:\n\n${destructive.join('\n')}\n\nProceed?`,
      )
      if (!ok) return
    }

    setError(null)
    setNotice(null)
    setImportResult(null)
    setBusy(true)
    setBusyLabel('Importing…')
    try {
      const excludeSkills = rejectedList
      const includeReview = approvedList
      const removeSkills = prefs.removeSkills
      const expected = buildExpectedSnapshot(profile)
      const result = await importResumeToProfile(id, fields, {
        excludeSkills,
        includeReview,
        mode: prefs.mode,
        skillsMode: prefs.skillsMode,
        removeSkills,
        expected,
        confirmReplace: destructive.length > 0,
      })
      setImportResult(formatImportResult(result, excludeSkills))
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch (err) {
      setError(`Import failed: ${resumeErrorMessage(err, 'Import')}`)
    } finally {
      setBusy(false)
      setBusyLabel(null)
    }
  }

  function formatImportResult(
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

  function toggleRejected(resumeId: string, name: string) {
    setRejected((prev) => {
      const current = prev[resumeId] ?? []
      const lower = name.toLowerCase()
      const exists = current.some((n) => n.toLowerCase() === lower)
      return {
        ...prev,
        [resumeId]: exists ? current.filter((n) => n.toLowerCase() !== lower) : [...current, name],
      }
    })
  }

  function toggleApproved(resumeId: string, name: string) {
    setApproved((prev) => {
      const current = prev[resumeId] ?? []
      const lower = name.toLowerCase()
      const exists = current.some((n) => n.toLowerCase() === lower)
      return {
        ...prev,
        [resumeId]: exists ? current.filter((n) => n.toLowerCase() !== lower) : [...current, name],
      }
    })
  }

  function onDelete(id: string, filename: string) {
    if (busy) return
    if (!window.confirm(`Delete ${filename}? This removes the stored file and its analysis.`)) return
    void run('Deletion', 'Deletion done.', () => deleteResume(id))
  }

  const resumes = resumesQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="Resumes"
        description="Upload PDF or DOCX files (up to 10 MB). Files are private to your account and parsed into structured data only when you run analysis."
      />
      <StorageStatusLine />

      <form
        onSubmit={(e) => void onUpload(e)}
        className="mb-4"
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Resume drop zone. You can also choose a file with the file picker below."
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            pickFile(e.dataTransfer.files?.[0] ?? null)
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && inputRef.current) {
              e.preventDefault()
              inputRef.current.click()
            }
          }}
          onClick={() => inputRef.current?.click()}
          className={`mb-2 rounded-xl border-2 border-dashed px-6 py-8 text-center text-sm ${
            dragOver ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          {file ? (
            <p className="font-medium text-slate-900">{file.name} ({formatSize(file.size)})</p>
          ) : (
            <p>Drag and drop a PDF or DOCX here, or click to choose a file. Max 10 MB.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            aria-label="Resume file"
            type="file"
            accept={ACCEPT_ATTR}
            disabled={busy}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="submit"
            disabled={busy || !file}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && busyLabel ? busyLabel : 'Upload resume'}
          </button>
        </div>
      </form>

      {busy && busyLabel && (
        <p role="status" className="mb-3 text-sm text-slate-600">
          {busyLabel} Please wait — do not resubmit.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {resumesQuery.isPending && <p className="text-sm text-slate-600">Loading resumes…</p>}
      {resumesQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load resumes</h2>
          <button
            type="button"
            onClick={() => resumesQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!resumesQuery.isPending && !resumesQuery.isError && resumes.length === 0 && (
        <EmptyState title="No resumes uploaded" description="Upload a PDF or DOCX resume to get started." />
      )}

      {resumes.length > 0 && (
        <ul className="space-y-3">
          {resumes.map((resume) => {
            const analysisState = analyses[resume.id] ?? { kind: 'idle' as const }
            const skills =
              analysisState.kind === 'ready' && analysisState.analysis.status === 'completed'
                ? skillNames(analysisState.analysis)
                : []
            const resumeRejected = rejected[resume.id] ?? []
            const resumeApproved = approved[resume.id] ?? []
            const loadedAnalysis =
              analysisState.kind === 'ready' ? analysisState.analysis : null
            const scalarRows = buildScalarRows(loadedAnalysis, profileQuery.data ?? null)
            const defaultChecks = scalarRows
              .filter((r) => r.change === 'new' || r.change === 'update')
              .map((r) => r.path)
            const reviewChecksForResume = reviewChecks[resume.id] ?? defaultChecks
            return (
              <li key={resume.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{resume.originalFilename}</p>
                    <p className="text-sm text-slate-600">
                      {formatSize(resume.fileSize)} · Uploaded {formatDate(resume.createdAt)} · {resume.status}
                      {resume.isDefault ? ' · default' : ''}
                    </p>
                    {analysisState.kind === 'ready' && (
                      <p className="mt-1 text-sm text-slate-600">
                        Analysis: {analysisState.analysis.status}
                        {analysisState.analysis.confidence ? ` · confidence ${analysisState.analysis.confidence}` : ''}
                      </p>
                    )}
                    {analysisState.kind === 'error' && (
                      <p role="alert" className="mt-1 text-sm text-red-700">{analysisState.message}</p>
                    )}
                    {skills.length > 0 && (
                      <ul aria-label={`Parsed skills for ${resume.originalFilename}`} className="mt-2 flex flex-wrap gap-1.5">
                        {skills.map((skill) => (
                          <li key={skill} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                            {skill}
                          </li>
                        ))}
                      </ul>
                    )}
                    {analysisState.kind === 'ready' && (
                      <AnalysisDetails
                        analysis={analysisState.analysis}
                        rejected={resumeRejected}
                        approved={resumeApproved}
                        onToggleReject={(name) => toggleRejected(resume.id, name)}
                        onToggleApprove={(name) => toggleApproved(resume.id, name)}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!resume.isDefault && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run('Default set', 'Default set done.', () => setDefaultResume(resume.id))}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAnalyze(resume.id)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      Analyze
                    </button>
                    {analysisState.kind === 'ready' && analysisState.analysis.status === 'failed' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRetry(resume.id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                      >
                        Retry analysis
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadAnalysis(resume.id)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      View analysis
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDownload(resume.id, resume.originalFilename)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setImportOpenId((open) => (open === resume.id ? null : resume.id))
                        setImportResult(null)
                      }}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(resume.id, resume.originalFilename)}
                      className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {importOpenId === resume.id && (
                  <ImportPanelBody
                    analysis={loadedAnalysis}
                    profile={profileQuery.data ?? null}
                    profileUnknown={profileQuery.isPending || profileQuery.isError}
                    prefs={prefsFor(resume.id)}
                    onPrefs={(patch) => patchPrefs(resume.id, patch)}
                    scalarRows={scalarRows}
                    checks={reviewChecksForResume}
                    onToggleReviewCheck={(path) => toggleReviewCheck(resume.id, path, reviewChecksForResume)}
                    rejected={resumeRejected}
                    approved={resumeApproved}
                    onToggleReject={(name: string) => toggleRejected(resume.id, name)}
                    removeSkills={prefsFor(resume.id).removeSkills}
                    onToggleRemoveSkill={(name) => toggleRemoveSkill(resume.id, name)}
                    busy={busy}
                    onImport={() => void onImport(resume.id)}
                    onCancel={() => {
                      setImportOpenId(null)
                      setImportResult(null)
                    }}
                    importResult={importResult}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
