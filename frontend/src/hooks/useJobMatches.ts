import { useQuery } from '@tanstack/react-query'
import { getJobMatches, type JobMatchFilters } from '@/services/jobs'

export function useJobMatches(filters: JobMatchFilters) {
  return useQuery({
    queryKey: ['job-matches', filters.minScore ?? 0, filters.page ?? 1, filters.pageSize ?? 20],
    queryFn: () => getJobMatches(filters),
    retry: 1,
  })
}
