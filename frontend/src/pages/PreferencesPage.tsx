import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { usePreferences } from '@/hooks/useProfile'
import { savePreferences } from '@/services/profile'

const WORK_MODES = ['remote', 'hybrid', 'onsite', 'flexible']
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance']

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(', ')
}

function fromCsv(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

export function PreferencesPage() {
  const queryClient = useQueryClient()
  const prefsQuery = usePreferences()
  const [roles, setRoles] = useState('')
  const [locations, setLocations] = useState('')
  const [countries, setCountries] = useState('')
  const [workMode, setWorkMode] = useState<string[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([])
  const [excludedTypes, setExcludedTypes] = useState<string[]>([])
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [period, setPeriod] = useState('')
  const [requiredSkills, setRequiredSkills] = useState('')
  const [preferredSkills, setPreferredSkills] = useState('')
  const [excludedCompanies, setExcludedCompanies] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const prefs = prefsQuery.data ?? null
  const snapshot = prefs ? JSON.stringify(prefs) : 'none'
  const [synced, setSynced] = useState<string | null>(null)
  if (snapshot !== synced && prefs) {
    setSynced(snapshot)
    setRoles(toCsv(prefs.desiredRoles))
    setLocations(toCsv(prefs.preferredLocations))
    setCountries(toCsv(prefs.preferredCountries))
    setWorkMode(prefs.workMode ?? [])
    setEmploymentTypes(prefs.employmentTypes ?? [])
    setExcludedTypes(prefs.excludedJobTypes ?? [])
    setSalaryMin(prefs.salaryMin?.toString() ?? '')
    setSalaryMax(prefs.salaryMax?.toString() ?? '')
    setCurrency(prefs.salaryCurrency ?? 'USD')
    setPeriod(prefs.salaryPeriod ?? '')
    setRequiredSkills(toCsv(prefs.requiredSkills))
    setPreferredSkills(toCsv(prefs.preferredSkills))
    setExcludedCompanies(toCsv(prefs.excludedCompanies))
  }

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault()
    const min = salaryMin.trim() === '' ? undefined : Number(salaryMin)
    const max = salaryMax.trim() === '' ? undefined : Number(salaryMax)
    if ((min !== undefined && (!Number.isInteger(min) || min < 0)) || (max !== undefined && (!Number.isInteger(max) || max < 0))) {
      setError('Salaries must be whole numbers of 0 or more.')
      return
    }
    if (min !== undefined && max !== undefined && min > max) {
      setError('Minimum salary cannot exceed maximum salary.')
      return
    }
    if (currency.trim() !== '' && currency.trim().length !== 3) {
      setError('Salary currency must be a 3-letter code (e.g. USD).')
      return
    }
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        desiredRoles: fromCsv(roles),
        preferredLocations: fromCsv(locations),
        preferredCountries: fromCsv(countries),
        workMode,
        employmentTypes,
        excludedJobTypes: excludedTypes,
        salaryCurrency: currency.trim() || undefined,
        requiredSkills: fromCsv(requiredSkills),
        preferredSkills: fromCsv(preferredSkills),
        excludedCompanies: fromCsv(excludedCompanies),
      }
      if (min !== undefined) body.salaryMin = min
      if (max !== undefined) body.salaryMax = max
      if (period !== '') body.salaryPeriod = period
      await savePreferences(body)
      setNotice('Preferences saved.')
      await queryClient.invalidateQueries({ queryKey: ['preferences'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Job preferences"
        description="Roles, locations, work modes, salary bounds, and exclusions that drive matching and eligibility."
      />
      {prefsQuery.isPending && <p className="text-sm text-slate-600">Loading preferences…</p>}
      {prefsQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load preferences</h2>
          <button
            type="button"
            onClick={() => prefsQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}
      {!prefsQuery.isPending && !prefsQuery.isError && (
        <form onSubmit={(e) => void onSave(e)} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Desired roles (comma-separated)
              <input aria-label="Desired roles" value={roles} onChange={(e) => setRoles(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Preferred locations (comma-separated)
              <input aria-label="Preferred locations" value={locations} onChange={(e) => setLocations(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Preferred countries (comma-separated)
              <input aria-label="Preferred countries" value={countries} onChange={(e) => setCountries(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Excluded companies (comma-separated)
              <input aria-label="Excluded companies" value={excludedCompanies} onChange={(e) => setExcludedCompanies(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Minimum salary
              <input aria-label="Minimum salary" type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Maximum salary
              <input aria-label="Maximum salary" type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Salary currency (3 letters)
              <input aria-label="Salary currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Salary period
              <select aria-label="Salary period" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5">
                <option value="">Unspecified</option>
                <option value="hourly">Hourly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              Required skills (comma-separated)
              <input aria-label="Required skills" value={requiredSkills} onChange={(e) => setRequiredSkills(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
            <label className="block text-sm text-slate-700">
              Preferred skills (comma-separated)
              <input aria-label="Preferred skills" value={preferredSkills} onChange={(e) => setPreferredSkills(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5" />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-900">Work modes</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {WORK_MODES.map((mode) => (
                <label key={mode} className="text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={workMode.includes(mode)}
                    onChange={() => toggle(workMode, mode, setWorkMode)}
                    className="mr-1"
                  />
                  {mode}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-slate-900">Employment types</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {EMPLOYMENT_TYPES.map((type) => (
                <label key={type} className="text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={employmentTypes.includes(type)}
                    onChange={() => toggle(employmentTypes, type, setEmploymentTypes)}
                    className="mr-1"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-slate-900">Excluded employment types</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {EMPLOYMENT_TYPES.map((type) => (
                <label key={type} className="text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={excludedTypes.includes(type)}
                    onChange={() => toggle(excludedTypes, type, setExcludedTypes)}
                    className="mr-1"
                  />
                  {type}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save preferences'}
          </button>
        </form>
      )}
    </div>
  )
}
