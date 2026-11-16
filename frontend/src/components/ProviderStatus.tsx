import { Ban, CircleSlash, Clock, Plug, PlugZap, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { providerView } from '@/lib/provider-status'
import type { DiscoverySourceResult } from '@/types/api'

type View = 'connected' | 'empty' | 'setup' | 'unavailable' | 'rate_limited' | 'disabled'

const viewMeta: Record<View, { label: string; dot: 'success' | 'neutral' | 'warning' | 'danger' | 'info'; Icon: typeof Plug }> = {
  connected: { label: 'Connected', dot: 'success', Icon: PlugZap },
  empty: { label: 'Available, no results', dot: 'info', Icon: Plug },
  setup: { label: 'Not configured', dot: 'warning', Icon: CircleSlash },
  disabled: { label: 'Disabled', dot: 'neutral', Icon: CircleSlash },
  rate_limited: { label: 'Rate limited', dot: 'warning', Icon: Clock },
  unavailable: { label: 'Unavailable', dot: 'danger', Icon: TriangleAlert },
}

/** Short, honest explanation. Never suggests editing valid credentials for an access failure. */
function detailFor(provider: DiscoverySourceResult, view: View): string {
  switch (view) {
    case 'connected':
      return `${provider.fetchedCount} result${provider.fetchedCount === 1 ? '' : 's'} from this search`
    case 'empty':
      return 'Connected, but no listings matched this search'
    case 'setup':
      return 'Add credentials in the backend environment to enable it'
    case 'disabled':
      return 'Turned off in backend configuration'
    case 'rate_limited':
      return provider.error ?? 'Too many requests; retry shortly'
    case 'unavailable':
      return provider.error ?? 'The provider could not be reached for this search'
    default:
      return ''
  }
}

/**
 * Compact per-source status list.
 *
 * When a search has run, this reflects the LIVE per-search outcome (from
 * `providerStatus`), so a source that is configured but blocked, rate limited,
 * or simply had no matches is reported accurately. Before any search it falls
 * back to the configured source status from `/api/jobs/sources`.
 */
export function ProviderStatusList({
  providers,
  className,
}: {
  providers: DiscoverySourceResult[]
  className?: string
}) {
  if (providers.length === 0) return null

  return (
    <ul className={cn('grid gap-2 sm:grid-cols-2', className)} aria-label="Job source status">
      {providers.map((provider) => {
        const view = providerView(provider)
        const meta = viewMeta[view]
        const { Icon } = meta
        return (
          <li
            key={provider.sourceName}
            className="flex items-start gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2.5"
          >
            <Icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                view === 'connected'
                  ? 'text-emerald-600'
                  : view === 'empty'
                    ? 'text-brand-600'
                    : view === 'unavailable'
                      ? 'text-red-600'
                      : 'text-ink-400',
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                <Badge variant={meta.dot === 'neutral' ? 'subtle' : meta.dot} size="sm" />
                {provider.sourceDisplayName}
                <span className="font-normal text-ink-500">&#183; {meta.label}</span>
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{detailFor(provider, view)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Banner shown when at least one source is working but another did not return
 * results. Keeps the healthy results visible and names the exact reason for
 * each gap — a blocked provider and a rate-limited one are not the same thing,
 * and collapsing them into "unavailable" would misreport the state.
 */
export function PartialResultsNotice({ providers }: { providers: DiscoverySourceResult[] }) {
  const unavailable = providers.filter((p) => providerView(p) === 'unavailable')
  const rateLimited = providers.filter((p) => providerView(p) === 'rate_limited')
  if (unavailable.length === 0 && rateLimited.length === 0) return null

  const names = (list: DiscoverySourceResult[]) => list.map((p) => p.sourceDisplayName).join(', ')

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="text-[13px] leading-relaxed">
        <p className="font-semibold text-amber-900">Some sources did not return results</p>
        <p className="mt-1 text-amber-800">
          Showing results from the sources that responded.
          {unavailable.length > 0 && <> Unavailable: {names(unavailable)}.</>}
          {rateLimited.length > 0 && <> Rate limited: {names(rateLimited)}.</>}
        </p>
      </div>
    </div>
  )
}

/** Shown when nothing is configured at all. */
export function NoSourcesConfigured({ providers }: { providers: DiscoverySourceResult[] }) {
  const needsSetup = providers.filter((p) => providerView(p) === 'setup' || providerView(p) === 'disabled')
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[12px] border border-line bg-surface-muted px-4 py-3"
    >
      <Ban className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
      <div className="text-[13px] leading-relaxed text-ink-600">
        <p className="font-semibold text-ink-900">No job source is available yet</p>
        <p className="mt-1">
          {needsSetup.length > 0 ? (
            <>
              Waiting on credentials for{' '}
              {needsSetup.map((p) => p.sourceDisplayName).join(', ')}. These are set on the server, not in
              the browser.
            </>
          ) : (
            'No source is currently configured on the server.'
          )}
        </p>
      </div>
    </div>
  )
}