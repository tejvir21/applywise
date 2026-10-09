import { useQuery } from '@tanstack/react-query'
import { getApplication, getApplicationEvents, getApplications, type ApplicationFilters } from '@/services/applications'

export function useApplications(filters: ApplicationFilters) {
  return useQuery({
    queryKey: ['applications', filters.status ?? '', filters.page ?? 1, filters.pageSize ?? 20],
    queryFn: () => getApplications(filters),
    retry: 1,
  })
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ['application', id],
    queryFn: () => getApplication(id),
    retry: 1,
  })
}

export function useApplicationEvents(id: string) {
  return useQuery({
    queryKey: ['application-events', id],
    queryFn: () => getApplicationEvents(id),
    retry: 1,
  })
}
