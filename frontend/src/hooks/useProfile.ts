import { useQuery } from '@tanstack/react-query'
import { getPreferences, getProfile } from '@/services/profile'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    retry: 1,
  })
}

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    retry: 1,
  })
}
