import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/lib/auth-context'
import { canUse, homeFor } from './nav'
import { Shell } from './Shell'

function Loading() {
  return (
    <p role="status" className="p-12 text-muted-foreground">
      Loading…
    </p>
  )
}

/** Signed-in screens only. Anyone else goes to the login page. */
export function SignedIn() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return <Loading />
  if (auth.status !== 'signed-in') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return (
    <Shell
      profile={auth.profile}
      onSignOut={() => {
        void auth.signOut()
      }}
    />
  )
}

/** A screen the role can't use sends them to their own landing screen. */
export function ForRole({ path, children }: { path: string; children: ReactNode }) {
  const auth = useAuth()
  if (auth.status !== 'signed-in') return null
  if (!canUse(auth.profile.role, path)) return <Navigate to={homeFor(auth.profile.role)} replace />
  return children
}

export function Home() {
  const auth = useAuth()
  return auth.status === 'signed-in' ? <Navigate to={homeFor(auth.profile.role)} replace /> : null
}
