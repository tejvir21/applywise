import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useProfile } from '@/hooks/useProfile'
import {
  addProfileSkill,
  createProfile,
  removeProfileSkill,
  updateProfile,
  type CandidateProfile,
} from '@/services/profile'

const TEXT_FIELDS: Array<{ key: keyof CandidateProfile; label: string; required?: boolean; type?: string }> = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'lastName', label: 'Last name', required: true },
  { key: 'displayName', label: 'Display name' },
  { key: 'email', label: 'Contact email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'location', label: 'Location' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'headline', label: 'Headline' },
  { key: 'currentJobTitle', label: 'Current job title' },
  { key: 'currentCompany', label: 'Current company' },
]

export function ProfilePage() {
  const queryClient = useQueryClient()
  const profileQuery = useProfile()
  const [form, setForm] = useState<Record<string, string>>({})
  const [years, setYears] = useState('')
  const [summary, setSummary] = useState('')
  const [skillName, setSkillName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = profileQuery.data ?? null
  const formKey = profile
    ? JSON.stringify([profile.firstName, profile.lastName, profile.skills.length, profile.yearsOfExperience ?? null])
    : 'new'
  const [syncedKey, setSyncedKey] = useState<string | null>(null)
  if (formKey !== syncedKey) {
    setSyncedKey(formKey)
    const next: Record<string, string> = {}
    for (const field of TEXT_FIELDS) {
      const value = profile?.[field.key]
      next[field.key] = typeof value === 'string' ? value : ''
    }
    setForm(next)
    setYears(profile?.yearsOfExperience?.toString() ?? '')
    setSummary(profile?.professionalSummary ?? '')
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['profile'] })
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault()
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.')
      return
    }
    const yearsNum = years.trim() === '' ? undefined : Number(years)
    if (yearsNum !== undefined && (!Number.isInteger(yearsNum) || yearsNum < 0 || yearsNum > 50)) {
      setError('Years of experience must be a whole number between 0 and 50.')
      return
    }
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...form, professionalSummary: summary || undefined }
      if (yearsNum !== undefined) body.yearsOfExperience = yearsNum
      if (profile) {
        await updateProfile(body)
        setNotice('Profile saved.')
      } else {
        await createProfile(body)
        setNotice('Profile created.')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function onAddSkill() {
    const name = skillName.trim()
    if (!name) return
    setError(null)
    setBusy(true)
    try {
      await addProfileSkill({ name })
      setSkillName('')
      setNotice('Skill added.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add skill')
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveSkill(skillId?: string) {
    if (!skillId) return
    setError(null)
    setBusy(true)
    try {
      await removeProfileSkill(skillId)
      setNotice('Skill removed.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove skill')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Candidate profile"
        description="Your verified profile data. Matching scores use only what is recorded here — nothing is assumed."
      />
      {profileQuery.isPending && <p className="text-sm text-slate-600">Loading profile…</p>}
      {profileQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load profile</h2>
          <button
            type="button"
            onClick={() => profileQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}
      {!profileQuery.isPending && !profileQuery.isError && (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Resumes</p>
            <p>
              Upload and manage your resume files on the{' '}
              <Link className="text-brand-700 underline" to="/resumes">Resumes page</Link>.
            </p>
          </div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Needed for meaningful matching</p>
            <p>
              First and last name are required. Skills, years of experience, target roles, and location
              preferences (see <Link className="text-brand-700 underline" to="/profile/preferences">preferences</Link>)
              decide how much the matcher can evaluate.
            </p>
          </div>
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
          <form onSubmit={(e) => void onSave(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm text-slate-700">
                {field.label}
                {field.required ? ' *' : ''}
                <input
                  aria-label={field.label}
                  type={field.type ?? 'text'}
                  required={field.required}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
                />
              </label>
            ))}
            <label className="block text-sm text-slate-700">
              Years of experience
              <input
                aria-label="Years of experience"
                type="number"
                min={0}
                max={50}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm text-slate-700 sm:col-span-2">
              Professional summary
              <textarea
                aria-label="Professional summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
              </button>
            </div>
          </form>

          {profile && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Skills</h2>
              {profile.skills.length === 0 && (
                <p className="mt-1 text-sm text-slate-600">No skills recorded yet — matching cannot score skills without them.</p>
              )}
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <li
                    key={skill._id ?? skill.name}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    {skill.name}
                    {skill.level ? ` (${skill.level})` : ''}
                    <button
                      type="button"
                      aria-label={`Remove skill ${skill.name}`}
                      disabled={busy}
                      onClick={() => void onRemoveSkill(skill._id)}
                      className="ml-1 font-bold text-slate-500 hover:text-red-700 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="New skill name"
                  placeholder="Add a skill you verifiably have"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !skillName.trim()}
                  onClick={() => void onAddSkill()}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {!profile && (
            <div className="mt-4">
              <EmptyState
                title="No profile yet"
                description="Fill in the form above to create one. Nothing is assumed until you save it."
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
