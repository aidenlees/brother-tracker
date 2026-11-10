/**
 * Each screen is its own chunk, loaded when first opened (and precached by the service
 * worker, so it opens offline too).
 */
import { lazy } from 'react'

export const LoginPage = lazy(() =>
  import('./login/LoginPage').then((m) => ({ default: m.LoginPage })),
)
export const TodayPage = lazy(() =>
  import('./today/TodayPage').then((m) => ({ default: m.TodayPage })),
)
export const OverviewPage = lazy(() =>
  import('./overview/OverviewPage').then((m) => ({ default: m.OverviewPage })),
)
export const LogPage = lazy(() => import('./log/LogPage').then((m) => ({ default: m.LogPage })))
export const TasksPage = lazy(() =>
  import('./tasks/TasksPage').then((m) => ({ default: m.TasksPage })),
)
export const PlanPage = lazy(() => import('./plan/PlanPage').then((m) => ({ default: m.PlanPage })))
export const WeekPage = lazy(() => import('./week/WeekPage').then((m) => ({ default: m.WeekPage })))
export const SessionPage = lazy(() =>
  import('./session/SessionPage').then((m) => ({ default: m.SessionPage })),
)
export const StrugglesPage = lazy(() =>
  import('./struggles/StrugglesPage').then((m) => ({ default: m.StrugglesPage })),
)
