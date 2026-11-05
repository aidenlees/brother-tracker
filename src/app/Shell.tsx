import { Link, NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import type { SignedInProfile } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import { homeFor, navFor } from './nav'

/** The signed-in frame: name, the screens this role can use, and sign out. */
export function Shell({ profile, onSignOut }: { profile: SignedInProfile; onSignOut: () => void }) {
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-1 px-6 pt-4 md:h-16 md:flex-nowrap md:pt-0">
          <Link to={homeFor(profile.role)} className="font-heading text-xl text-foreground">
            Practice tracker
          </Link>
          <div className="ml-auto flex items-center gap-3 md:order-last">
            <span className="text-sm text-muted-foreground">{profile.display_name}</span>
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
          <nav
            aria-label="Main"
            className="-mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6 md:mx-0 md:w-auto md:overflow-visible md:px-0"
          >
            <ul className="flex gap-6 text-sm">
              {screens.map((screen) => (
                <li key={screen.path}>
                  <NavLink
                    to={`/${screen.path}`}
                    className={({ isActive }) =>
                      cn(
                        'inline-block border-b-2 py-3 whitespace-nowrap transition-colors md:py-5',
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
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  )
}
