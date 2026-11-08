/**
 * New versions of the app. The service worker downloads a new version in the background
 * but holds it until asked, so the code never changes under a page mid-log. Left alone,
 * it waits until every tab of the app is closed, which an installed app or a tab kept
 * open may never be. So the app looks for a new version when it opens, when it comes
 * back into view and every hour (AppUpdateProvider), and once one is ready the Shell
 * offers to reload into it.
 */
import { createContext, useContext } from 'react'

export type AppUpdate = {
  /** A new version is downloaded and waiting. */
  ready: boolean
  /** Switch to the new version (the page reloads; drafts are already on the device). */
  apply: () => void
  /** Look for a new version now. */
  check: () => void
}

export const AppUpdateContext = createContext<AppUpdate>({
  ready: false,
  apply: () => undefined,
  check: () => undefined,
})

export const useAppUpdate = () => useContext(AppUpdateContext)
