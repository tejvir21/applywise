/**
 * Provider status helpers shared between the status components and pages.
 *
 * Kept out of the component file so that module exports only components,
 * which keeps React Fast Refresh working during development.
 */

import type { DiscoverySourceResult } from '@/types/api'

type View = 'connected' | 'empty' | 'setup' | 'unavailable' | 'rate_limited' | 'disabled'

/**
 * Map a provider outcome onto the states a user actually cares about:
 * connected, no results, needs setup, or temporarily unavailable.
 *
 * `upstream_error` is deliberately NOT described as a configuration problem:
 * a 403 (e.g. Jooble's bot protection) is an access failure, not bad
 * credentials, and telling someone to edit working keys would be wrong.
 */
export function providerView(status: DiscoverySourceResult): View {
  switch (status.state) {
    case 'connected_with_results':
      return 'connected'
    case 'connected_no_matches':
      return 'empty'
    case 'not_configured':
      return 'setup'
    case 'rate_limited':
      return 'rate_limited'
    case 'temporarily_unavailable':
    case 'blocked_upstream':
      return 'unavailable'
    default:
      return 'unavailable'
  }
}

/** Roll up provider statuses into counts used by the results summary. */
export function summarizeProviders(providers: DiscoverySourceResult[]) {
  const connected = providers.filter((p) => providerView(p) === 'connected').length
  const available = providers.filter(
    (p) => providerView(p) === 'connected' || providerView(p) === 'empty',
  ).length
  const failing = providers.filter(
    (p) => providerView(p) === 'unavailable' || providerView(p) === 'rate_limited',
  ).length
  return { connected, available, failing }
}