import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router'
import { ForRole, Home, Loading, SignedIn } from './guards'
import { SCREENS } from './nav'
import { NotBuiltPage } from './NotBuiltPage'
import { NotFoundPage } from './NotFoundPage'
import { RouteError, RouteErrorPage } from './RouteError'
import {
  ExportPage,
  LogPage,
  LoginPage,
  OverviewPage,
  PlanPage,
  RetriesPage,
  SessionPage,
  SettingsPage,
  StrugglesPage,
  TasksPage,
  TodayPage,
  WeekPage,
} from './pages'

/** Screens built so far; the rest show a "not built yet" page until their phase. */
const BUILT: Partial<Record<string, ReactNode>> = {
  today: <TodayPage />,
  log: <LogPage />,
  session: <SessionPage />,
  week: <WeekPage />,
  plan: <PlanPage />,
  tasks: <TasksPage />,
  overview: <OverviewPage />,
  struggles: <StrugglesPage />,
  retries: <RetriesPage />,
  settings: <SettingsPage />,
  export: <ExportPage />,
}

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      errorElement: <RouteErrorPage />,
      element: (
        <Suspense fallback={<Loading />}>
          <LoginPage />
        </Suspense>
      ),
    },
    {
      element: <SignedIn />,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <Home /> },
        ...SCREENS.map((screen) => ({
          path: screen.params ? `${screen.path}/${screen.params}` : screen.path,
          errorElement: <RouteError />,
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
