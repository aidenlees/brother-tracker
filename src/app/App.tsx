import { defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from 'react-router'
import { AppUpdateProvider } from '@/lib/AppUpdateProvider'
import { AuthProvider } from '@/lib/AuthProvider'
import { CACHE_MAX_AGE, CACHE_VERSION, persister, queryClient } from '@/lib/query'
import { router } from './router'

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        buster: CACHE_VERSION,
        // Short-lived answers (signed links to the book's pages) aren't kept on the device.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && query.meta?.persist !== false,
        },
      }}
    >
      <AppUpdateProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppUpdateProvider>
    </PersistQueryClientProvider>
  )
}
