import { AlertDialog } from 'radix-ui'
import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { SyncStatus } from '@/components/SyncStatus'
import { Button } from '@/components/ui/button'
import type { SignedInProfile } from '@/lib/auth-context'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { cn } from '@/lib/utils'
import { homeFor, navFor } from './nav'

/**
 * The signed-in frame, in the same column as every screen: the wordmark, who's signed in
 * and sign out on top; the screens this role can use and where saves are below.
 */
export function Shell({
  profile,
  offline,
  onSignOut,
}: {
  profile: SignedInProfile
  offline: boolean
  onSignOut: () => void
}) {
  const screens = navFor(profile.role)

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto max-w-2xl px-6">
          <div className="flex items-center gap-4 pt-4">
            <Link
              to={homeFor(profile.role)}
              className="mr-auto font-heading text-lead text-foreground"
            >
              Practice tracker
            </Link>
            <span className="text-small text-muted-foreground">{profile.display_name}</span>
            <SignOut onSignOut={onSignOut} />
          </div>
          {/* When the status doesn't fit beside the tabs it wraps above them, so the active
              tab's underline always sits on the header's rule. */}
          <div className="flex flex-wrap-reverse items-center justify-between gap-x-6">
            <nav aria-label="Main" className="min-w-0 overflow-x-auto">
              <ul className="flex gap-6 text-small">
                {screens.map((screen) => (
                  <li key={screen.path}>
                    <NavLink
                      to={`/${screen.path}`}
                      className={({ isActive }) =>
                        cn(
                          'inline-block border-b-2 py-3 whitespace-nowrap transition-colors',
                          isActive
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )
                      }
                    >
                      {screen.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            {profile.role === 'student' ? (
              <div className="flex min-h-11 items-center">
                <SyncStatus offline={offline} />
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-6 pt-10 pb-16">
        <Suspense
          fallback={
            <p role="status" className="text-muted-foreground">
              Loading…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

/** Sign out, with a word first if anything saved here hasn't reached the server. */
function SignOut({ onSignOut }: { onSignOut: () => void }) {
  const outbox = useOutbox()
  const unsynced = outbox.pending + outbox.parked.length
  if (unsynced === 0) {
    return (
      <Button variant="ghost" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    )
  }
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" size="sm">
          Sign out
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-foreground/30" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-card p-6 text-foreground">
          <AlertDialog.Title className="font-heading text-title">Sign out now?</AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground">
            {unsynced === 1 ? '1 change hasn’t' : `${unsynced} changes haven’t`} reached the server
            yet. They stay on this device and sync the next time you sign in here.
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Stay signed in</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={onSignOut}>Sign out</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
