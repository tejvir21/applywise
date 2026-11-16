import { useQuery } from '@tanstack/react-query'
import { searchDiscoveredJobs } from '@/services/discovery'
import type { DiscoveryFilters } from '@/types/api'

/**
 * Live discovery hook. Enabled only when a role is present so we never fire an
 * empty search. Cached by the backend for "load more" without new upstream
 * calls, and by React Query here while params are stable.
 */
export function useJobDiscovery(filters: DiscoveryFilters, enabled = true) {
  const roles = filters.roles.trim()
  return useQuery({
    queryKey: [
      'job-discovery',
      roles,
      filters.location ?? '',
      filters.freshness ?? 'any',
      filters.sort ?? 'relevance',
      filters.includeRemote ?? true,
      filters.includeWorldwideRemote ?? true,
      filters.countryIso ?? 'IN',
      filters.page ?? 1,
      filters.pageSize ?? 20,
    ],
    queryFn: () => searchDiscoveredJobs(filters),
    enabled: enabled && roles.length > 0,
    retry: 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
