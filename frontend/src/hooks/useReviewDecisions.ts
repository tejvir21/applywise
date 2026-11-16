import { useState } from 'react'
import { DEFAULT_PREFS, type ImportPrefState } from '@/services/review-model'

const REJECTED_STORAGE_KEY = 'applywise-review-rejected'
const APPROVED_STORAGE_KEY = 'applywise-review-approved'
const IMPORT_PREFS_KEY = 'applywise-import-prefs'

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

/**
 * Review decisions scoped by resume ID, persisted to localStorage.
 *
 * Write-through persistence: state updates only after the write succeeds,
 * so a failed save surfaces an error instead of pretending the decision
 * stuck. Shapes are unchanged from the original implementation, so
 * decisions stored by older versions keep working. Nothing is sent to the
 * server: approvals/rejections are local review state until import.
 */
export function useReviewDecisions() {
  const [rejected, setRejected] = useState<Record<string, string[]>>(() =>
    loadStringMap(REJECTED_STORAGE_KEY),
  )
  const [approved, setApproved] = useState<Record<string, string[]>>(() =>
    loadStringMap(APPROVED_STORAGE_KEY),
  )
  const [importPrefs, setImportPrefs] = useState<Record<string, ImportPrefState>>(() =>
    loadImportPrefs(),
  )
  const [saveError, setSaveError] = useState<string | null>(null)

  function persist(key: string, value: Record<string, unknown>): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      setSaveError(
        'Could not save your review decision in this browser (storage unavailable). ' +
          'The decision was not recorded — please try again.',
      )
      return false
    }
  }

  function toggleInList(
    list: Record<string, string[]>,
    setList: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
    key: string,
    resumeId: string,
    name: string,
  ) {
    const current = list[resumeId] ?? []
    const lower = name.toLowerCase()
    const next = current.some((n) => n.toLowerCase() === lower)
      ? current.filter((n) => n.toLowerCase() !== lower)
      : [...current, name]
    if (persist(key, { ...list, [resumeId]: next })) {
      setSaveError(null)
      setList((prev) => ({ ...prev, [resumeId]: next }))
    }
  }

  function toggleRejected(resumeId: string, name: string) {
    toggleInList(rejected, setRejected, REJECTED_STORAGE_KEY, resumeId, name)
  }

  function toggleApproved(resumeId: string, name: string) {
    toggleInList(approved, setApproved, APPROVED_STORAGE_KEY, resumeId, name)
  }

  function patchPrefs(resumeId: string, patch: Partial<ImportPrefState>) {
    const next = { ...(importPrefs[resumeId] ?? DEFAULT_PREFS), ...patch }
    if (persist(IMPORT_PREFS_KEY, { ...importPrefs, [resumeId]: next })) {
      setSaveError(null)
      setImportPrefs((prev) => ({ ...prev, [resumeId]: next }))
    }
  }

  function prefsFor(resumeId: string): ImportPrefState {
    return importPrefs[resumeId] ?? DEFAULT_PREFS
  }

  return {
    rejected,
    approved,
    importPrefs,
    prefsFor,
    patchPrefs,
    toggleRejected,
    toggleApproved,
    saveError,
    clearSaveError: () => setSaveError(null),
  }
}
