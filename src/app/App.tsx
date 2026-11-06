import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '@/lib/AuthProvider'
import { CACHE_MAX_AGE, CACHE_VERSION, persister, queryClient } from '@/lib/query'
import { router } from './router'

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: CACHE_VERSION }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  )
}
