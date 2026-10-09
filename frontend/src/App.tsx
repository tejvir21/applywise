import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from '@/routes'
import { setSessionExpiredHandler } from '@/services/api'
import { useAuthStore } from '@/stores/auth-store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
})

let sessionHandlersWired = false

export default function App() {
  useEffect(() => {
    if (!sessionHandlersWired) {
      sessionHandlersWired = true
      // Full-page redirect on unrecoverable session expiry (login boundary).
      setSessionExpiredHandler(() => {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login')
        }
      })
    }
    void useAuthStore.getState().restore()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
