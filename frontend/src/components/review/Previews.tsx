import { ExternalLink, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

function FieldRow({ label, value, flag }: { label: string; value?: string; flag?: string }) {
  if (!value && !flag) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-sm">
      <dt className="w-28 shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-slate-900">{value || <em className="text-slate-400">—</em>}</dd>
      {flag && (
        <dd>
          <Badge variant="warning" title={flag}>
            Confirm
          </Badge>
        </dd>
      )}
    </div>
  )
}

function AmbiguousNote({ text }: { text: string }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}

export interface PersonalView {
  name?: string
  email?: string
  phone?: string
  location?: string
  city?: string
  state?: string
  country?: string
  locationEvidence?: string
}

/** Personal details with destination fields and a confirmable name split. */
export function PersonalPreview({ personal }: { personal: PersonalView }) {
  const parts = (personal.name ?? '').split(' ').filter(Boolean)
  const ambiguousName = parts.length === 1 || parts.length > 3
  const firstName = parts[0] ?? ''
  const lastName = parts.slice(1).join(' ')
  const hasAnything =
    personal.name || personal.email || personal.phone || personal.location || personal.city
  if (!hasAnything) {
    return <p className="text-sm text-slate-500">No personal details were extracted from this resume.</p>
  }
  return (
    <div>
      <dl>
        {personal.name && (
          <>
            <FieldRow
              label="First name"
              value={firstName}
              flag={ambiguousName ? 'Unusual name shape — confirm the split before importing.' : undefined}
            />
            <FieldRow
              label="Last name"
              value={lastName || undefined}
              flag={ambiguousName ? 'Unusual name shape — confirm the split before importing.' : undefined}
            />
            <p className="break-words py-0.5 pl-28 text-[11px] text-slate-400">
              Original text preserved: “{personal.name}”
            </p>
          </>
        )}
        <FieldRow label="Email" value={personal.email} />
        <FieldRow label="Phone" value={personal.phone} />
        <FieldRow label="Location" value={personal.location} />
        <FieldRow label="City" value={personal.city} />
        <FieldRow label="State" value={personal.state} />
        <FieldRow label="Country" value={personal.country} />
        {personal.locationEvidence && (
          <p className="break-words py-0.5 pl-28 text-[11px] text-slate-400">
            As written: “{personal.locationEvidence}”
          </p>
        )}
      </dl>
    </div>
  )
}

export interface ExperienceView {
  title?: string
  company?: string
  startDate?: string
  endDate?: string
  location?: string
  description?: string
  technologies?: string[]
}

export function ExperiencePreview({ entries }: { entries: ExperienceView[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No experience entries were extracted from this resume.</p>
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' – ')
        const ambiguous = !entry.title || !entry.startDate
        return (
          <li
            key={`${entry.title ?? 'untitled'}-${entry.company ?? 'unknown'}-${index}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
          >
            <p className="text-sm font-semibold text-slate-900">
              {entry.title || <em className="font-normal text-slate-400">Untitled role</em>}
            </p>
            <p className="break-words text-xs text-slate-600">
              {[entry.company, entry.location].filter(Boolean).join(' · ')}
              {dates ? ` · ${dates}` : ''}
            </p>
            {entry.description && (
              <p className="mt-1 break-words text-xs text-slate-600">{entry.description.trim().slice(0, 400)}</p>
            )}
            {entry.technologies && entry.technologies.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">Tech: {entry.technologies.join(', ')}</p>
            )}
            {ambiguous && (
              <AmbiguousNote text="Missing title or dates — kept for review. Nothing was invented to fill the gaps." />
            )}
          </li>
        )
      })}
    </ul>
  )
}

export interface EducationView {
  degree?: string
  institution?: string
  startDate?: string
  endDate?: string
  location?: string
  honors?: string
  coursework?: string[]
}

export function EducationPreview({ entries }: { entries: EducationView[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No education entries were extracted from this resume.</p>
  }
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' – ')
        return (
          <li
            key={`${entry.degree ?? 'degree'}-${entry.institution ?? 'unknown'}-${index}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
          >
            <p className="break-words text-sm font-semibold text-slate-900">
              {entry.degree || <em className="font-normal text-slate-400">Unnamed qualification</em>}
            </p>
            <p className="break-words text-xs text-slate-600">
              {[entry.institution, entry.location].filter(Boolean).join(' · ')}
              {dates ? ` · ${dates}` : ''}
            </p>
            {entry.honors && <p className="mt-1 text-xs text-slate-600">Honors: {entry.honors}</p>}
            {entry.coursework && entry.coursework.length > 0 && (
              <p className="mt-1 break-words text-xs text-slate-500">
                Coursework: {entry.coursework.join(', ')} (study evidence — never auto-imported as professional skills)
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function LinksPreview({ links }: { links: Record<string, unknown> }) {
  const rows: Array<{ label: string; url: string }> = []
  for (const key of ['linkedin', 'github', 'portfolio', 'website'] as const) {
    if (typeof links[key] === 'string' && links[key]) {
      rows.push({ label: key, url: links[key] as string })
    }
  }
  const other = Array.isArray(links.other) ? links.other.filter((u): u is string => typeof u === 'string' && !!u) : []
  for (const url of other) rows.push({ label: 'other', url })
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No social or portfolio links were found. Nothing was invented.</p>
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        let host = ''
        try {
          host = new URL(row.url).hostname
        } catch {
          host = row.url
        }
        return (
          <li key={`${row.label}-${row.url}`} className="flex items-start gap-2 text-sm">
            <span className="w-20 shrink-0 text-xs font-medium capitalize text-slate-500">{row.label}</span>
            <span className="min-w-0 flex-1 break-all text-slate-900">
              {row.url}
              <span className="block text-[11px] text-slate-400">Detected from hostname: {host}</span>
            </span>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          </li>
        )
      })}
    </ul>
  )
}
