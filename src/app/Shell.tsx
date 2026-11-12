import { AlertDialog } from 'radix-ui'
import { Menu, X } from 'lucide-react'
import { Suspense, useId, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { SyncStatus } from '@/components/SyncStatus'
import { note } from '@/components/sheet'
import { Button } from '@/components/ui/button'
import { useAppUpdate } from '@/lib/app-update'
import type { SignedInProfile } from '@/lib/auth-context'
import { useOutbox } from '@/lib/outbox/outbox-context'
import { cn } from '@/lib/utils'
import { homeFor, navFor, type Screen } from './nav'

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
      {/* The notebook's margin line, down the left of the column, behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-1/2 -z-10 w-full max-w-2xl -translate-x-1/2"
      >
        <span className="absolute inset-y-0 left-3 w-px bg-margin" />
      </div>
      <header className="border-b border-border">
        <div className="mx-auto max-w-2xl px-6">
          <div className="flex items-baseline gap-4 pt-5">
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
            <MainNav screens={screens} />
            {profile.role === 'student' ? (
              <div className="flex min-h-11 items-center">
                <SyncStatus offline={offline} />
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-6 pt-10 pb-16">
        <NewVersion />
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

/** More screens than fit a phone's width: below 640 px they fold into a menu. */
const FOLD_AFTER = 4

const tabClass = (active: boolean) =>
  cn(
    'inline-block border-b-2 py-3 whitespace-nowrap transition-colors',
    active
      ? 'border-foreground text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground',
  )

/**
 * The screens this role can use, as tabs along the header's rule. On a phone, a role
 * with more than four screens sees the current one and a Menu button that lists them.
 */
function MainNav({ screens }: { screens: Screen[] }) {
  const folds = screens.length > FOLD_AFTER
  const { pathname } = useLocation()
  // Open on the screen it was opened on: choosing another screen closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (next: boolean) => {
    setOpenOn(next ? pathname : null)
  }
  const listId = useId()
  const current = screens.find((s) => pathname.startsWith(`/${s.path}`))

  return (
    <nav
      aria-label="Main"
      className={cn('min-w-0', folds && 'basis-full sm:basis-auto')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      {folds ? (
        <div className="flex items-center justify-between sm:hidden">
          <span className={tabClass(true)}>{current?.label ?? 'Menu'}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => {
              setOpen(!open)
            }}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
            Menu
          </Button>
        </div>
      ) : null}
      <ul
        id={listId}
        className={cn(
          'text-small',
          folds
            ? cn(
                'flex-col gap-1 border-t border-border py-2 sm:flex sm:flex-row sm:gap-6 sm:border-0 sm:py-0',
                open ? 'flex' : 'hidden',
              )
            : 'flex gap-6',
        )}
      >
        {screens.map((screen) => (
          <li key={screen.path}>
            <NavLink
              to={`/${screen.path}`}
              className={({ isActive }) =>
                folds
                  ? cn(
                      'block py-2 sm:inline-block sm:border-b-2 sm:py-3 sm:whitespace-nowrap',
                      'transition-colors',
                      isActive
                        ? 'font-medium text-foreground sm:border-foreground sm:font-normal'
                        : 'text-muted-foreground hover:text-foreground sm:border-transparent',
                    )
                  : tabClass(isActive)
              }
            >
              {screen.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Once a new version of the app is downloaded: one line, and the reload into it. */
function NewVersion() {
  const update = useAppUpdate()
  if (!update.ready) return null
  return (
    <div role="status" className={note('mb-8 flex items-center justify-between gap-4')}>
      <p className="text-small text-foreground">A new version of the app is ready.</p>
      <Button size="sm" onClick={update.apply}>
        Update
      </Button>
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
