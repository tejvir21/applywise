import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHealth } from '@/hooks/useHealth'
import { usePlatforms } from '@/hooks/usePlatforms'
import { getSubmissionSettings, updateSubmissionSettings } from '@/services/platforms'

type PlatformRow = { platform: string; mode: string; authorized: boolean }

export function SettingsPage() {
  const queryClient = useQueryClient()
  const health = useHealth()
  const platformsQuery = usePlatforms()
  const settingsQuery = useQuery({
    queryKey: ['submission-settings'],
    queryFn: getSubmissionSettings,
    retry: 1,
  })

  const [paused, setPaused] = useState<boolean | null>(null)
  const [dailyLimit, setDailyLimit] = useState('')
  const [minScore, setMinScore] = useState('')
  const [rows, setRows] = useState<PlatformRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const settings = settingsQuery.data ?? null
  const snapshot = settings ? JSON.stringify(settings) : null
  const [synced, setSynced] = useState<string | null>(null)
  if (snapshot && snapshot !== synced) {
    setSynced(snapshot)
    setPaused(settings!.globalPaused)
    setDailyLimit(settings!.dailyLimit.toString())
    setMinScore(settings!.minMatchScore.toString())
    setRows(settings!.platforms.map((p) => ({ ...p })))
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault()
    const limit = dailyLimit.trim() === '' ? undefined : Number(dailyLimit)
    const score = minScore.trim() === '' ? undefined : Number(minScore)
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      setError('Daily limit must be a whole number between 1 and 100.')
      return
    }
    if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
      setError('Minimum match score must be a whole number between 0 and 100.')
      return
    }
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await updateSubmissionSettings({
        globalPaused: paused ?? undefined,
        dailyLimit: limit,
        minMatchScore: score,
        platforms: (rows ?? []).map((r) => ({
          platform: r.platform,
          mode: r.mode as 'auto' | 'permission' | 'disabled',
          authorized: r.authorized,
        })),
      })
      setNotice('Submission settings saved.')
      await queryClient.invalidateQueries({ queryKey: ['submission-settings'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function setRowMode(platform: string, mode: string) {
    setRows((prev) => {
      const list = prev ?? []
      if (list.some((r) => r.platform === platform)) {
        return list.map((r) => (r.platform === platform ? { ...r, mode } : r))
      }
      return [...list, { platform, mode, authorized: false }]
    })
  }

  function setRowAuthorized(platform: string, authorized: boolean) {
    setRows((prev) => {
      const list = prev ?? []
      if (list.some((r) => r.platform === platform)) {
        return list.map((r) => (r.platform === platform ? { ...r, authorized } : r))
      }
      return [...list, { platform, mode: 'permission', authorized }]
    })
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Submission automation controls. Sign-in uses secure sessions; provider selection stays server configuration."
      />
      {settingsQuery.isPending && <p className="text-sm text-slate-600">Loading settings…</p>}
      {settingsQuery.isError && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-8 text-center">
          <h2 className="text-sm font-semibold text-red-900">Could not load settings</h2>
          <button
            type="button"
            onClick={() => settingsQuery.refetch()}
            className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}
      {!settingsQuery.isPending && !settingsQuery.isError && (
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
          <Card>
            <CardHeader>
              <CardTitle>Automated submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={paused ?? false}
                  onChange={(e) => setPaused(e.target.checked)}
                />
                Global pause — stop all new automated submissions immediately
              </label>
              <label className="block text-slate-700">
                Maximum applications per day
                <input
                  aria-label="Maximum applications per day"
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-slate-700">
                Minimum match score for automatic submission
                <input
                  aria-label="Minimum match score"
                  type="number"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <p className="text-xs text-slate-500">
                Limits count actual submission attempts. No automatic submission path exists for any
                platform today, so these guard future integrations.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platforms</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {platformsQuery.isPending && <p className="text-slate-600">Loading platforms…</p>}
              {platformsQuery.data && (
                <ul className="space-y-2">
                  {platformsQuery.data.map((platform) => {
                    const row = rows?.find((r) => r.platform === platform.platform)
                    return (
                      <li key={platform.platform} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                        <span className="font-medium text-slate-900">{platform.displayName}</span>
                        <span className="text-xs text-slate-500">apply: {platform.capabilities.submit.status}</span>
                        <label className="text-xs text-slate-600">
                          mode
                          <select
                            aria-label={`Mode for ${platform.displayName}`}
                            value={row?.mode ?? 'permission'}
                            onChange={(e) => setRowMode(platform.platform, e.target.value)}
                            className="ml-1 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                          >
                            <option value="auto">auto</option>
                            <option value="permission">permission</option>
                            <option value="disabled">disabled</option>
                          </select>
                        </label>
                        <label className="text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={row?.authorized ?? false}
                            onChange={(e) => setRowAuthorized(platform.platform, e.target.checked)}
                            className="mr-1"
                          />
                          authorized
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}

      <Card>
        <CardHeader>
          <CardTitle>AI provider (server configuration)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          {health.isPending && <p>Loading…</p>}
          {health.data && <p>Active provider: {health.data.ai_provider}. Changing providers is server configuration, not an in-app setting.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data export</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Data export is not available yet.
        </CardContent>
      </Card>
    </div>
  )
}
