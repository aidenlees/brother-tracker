import type { ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'
import { ForRole, Home, SignedIn } from './guards'
import { LoginPage } from './login/LoginPage'
import { SCREENS } from './nav'
import { NotBuiltPage } from './NotBuiltPage'
import { NotFoundPage } from './NotFoundPage'
import { OverviewPage } from './overview/OverviewPage'
import { TodayPage } from './today/TodayPage'

/** Screens built so far; the rest show a "not built yet" page until their phase. */
const BUILT: Partial<Record<string, ReactNode>> = {
  today: <TodayPage />,
  overview: <OverviewPage />,
}

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <SignedIn />,
      children: [
        { index: true, element: <Home /> },
        ...SCREENS.map((screen) => ({
          path: screen.path,
          element: (
            <ForRole path={screen.path}>
              {BUILT[screen.path] ?? <NotBuiltPage title={screen.label} />}
            </ForRole>
          ),
        })),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)
