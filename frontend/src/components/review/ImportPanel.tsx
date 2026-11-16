import type { CandidateProfile } from '@/services/profile'
import type { ResumeAnalysis } from '@/services/resumes'
import {
  IMPORT_FIELDS,
  IMPORT_MODES,
  computeSkillRemovals,
  proposedImportValues,
  structuredView,
  type ImportPrefState,
  type ScalarReviewRow,
} from '@/services/review-model'

const CHANGE_BADGE: Record<ScalarReviewRow['change'], string> = {
  new: 'bg-emerald-100 text-emerald-800',
  update: 'bg-amber-100 text-amber-800',
  unchanged: 'bg-slate-100 text-slate-600',
  unsupported: 'bg-slate-100 text-slate-400',
}

export function ImportPanelBody(props: {
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
  const verifiedNew = skills.filter(
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
  const courseworkCount = skills.filter((s) => s.category === 'coursework').length

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
