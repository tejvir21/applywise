import { useQuery } from '@tanstack/react-query'
import { getHealth } from '@/services/health'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    retry: 1,
    refetchInterval: 30_000,
  })
}
