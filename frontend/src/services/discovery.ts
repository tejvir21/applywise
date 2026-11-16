import { discoverySearchPageSchema } from '@/schemas/jobs'
import { apiGet } from '@/services/api'
import type { DiscoveryPage, DiscoveryFilters } from '@/types/api'

/** Live job discovery via GET /api/jobs/search. */
export async function searchDiscoveredJobs(filters: DiscoveryFilters): Promise<DiscoveryPage> {
  const params = new URLSearchParams()
  params.set('roles', filters.roles)
  if (filters.location) params.set('location', filters.location)
  if (filters.countryIso) params.set('countryIso', filters.countryIso)
  if (filters.freshness && filters.freshness !== 'any') params.set('freshness', filters.freshness)
  if (filters.sort && filters.sort !== 'relevance') params.set('sort', filters.sort)
  if (filters.includeRemote === false) params.set('includeRemote', 'false')
  if (filters.includeWorldwideRemote === false) params.set('includeWorldwideRemote', 'false')
  if (filters.page !== undefined) params.set('page', String(filters.page))
  if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize))
  const data = await apiGet<unknown>(`/api/jobs/search?${params.toString()}`)
  return discoverySearchPageSchema.parse(data)
}
