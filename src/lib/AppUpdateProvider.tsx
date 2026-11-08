import { useMemo, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AppUpdateContext } from './app-update'

const HOUR = 60 * 60 * 1000

// Set once the service worker is registered (production builds only; in dev the hook
// is a stand-in that registers nothing).
let registration: ServiceWorkerRegistration | undefined

function check() {
  if (!registration || registration.installing || !navigator.onLine) return
  registration.update().catch(() => undefined) // a flaky network: the next check tries again
}

/** Registers the service worker and keeps looking for new versions (src/lib/app-update.ts). */
export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, found) {
      registration = found
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, HOUR)
    },
  })
  const value = useMemo(
    () => ({ ready, apply: () => void updateServiceWorker(true), check }),
    [ready, updateServiceWorker],
  )
  return <AppUpdateContext value={value}>{children}</AppUpdateContext>
}
