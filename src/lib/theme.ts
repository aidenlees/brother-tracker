/**
 * The theme: System (follow the device), Light or Dark, saved in this browser only
 * (decided 2026-11-12: per device, no database change). tokens.css follows the system
 * unless <html data-theme="light|dark"> overrides it. A small script in index.html
 * applies the saved choice before the page draws; keep its key in step with THEME_KEY
 * (theme.test.ts checks).
 */
import { useCallback, useState } from 'react'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_KEY = 'theme'

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value)

/** The saved choice, or System when there is none (or storage is blocked). */
export function readTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme {
  try {
    const saved = storage.getItem(THEME_KEY)
    return isTheme(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Applies a choice to the page: the data-theme override, and the browser frame colour
 * (the theme-color metas, one per scheme, made by vite.config.ts from the paper token).
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  for (const meta of doc.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme]',
  )) {
    const scheme = meta.dataset.scheme
    meta.media =
      theme === 'system'
        ? `(prefers-color-scheme: ${scheme ?? 'light'})`
        : scheme === theme
          ? 'all'
          : 'not all'
  }
}

/** Saves a choice on this device and applies it. System clears the saved value. */
export function saveTheme(theme: Theme, storage: Storage = localStorage): void {
  try {
    if (theme === 'system') storage.removeItem(THEME_KEY)
    else storage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked (a private window): the choice still applies until the tab closes.
  }
  applyTheme(theme)
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  const choose = useCallback((next: Theme) => {
    saveTheme(next)
    setTheme(next)
  }, [])
  return [theme, choose]
}
