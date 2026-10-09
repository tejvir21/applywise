import { useQuery } from '@tanstack/react-query'
import { getPlatforms } from '@/services/platforms'

export function usePlatforms() {
  return useQuery({
    queryKey: ['platforms'],
    queryFn: getPlatforms,
    retry: 1,
    staleTime: 5 * 60_000,
  })
}
