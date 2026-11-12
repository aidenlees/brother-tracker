import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, readTheme, saveTheme, THEME_KEY } from './theme'

function metas() {
  document.head.innerHTML = ['light', 'dark']
    .map(
      (scheme) =>
        `<meta name="theme-color" data-scheme="${scheme}" media="(prefers-color-scheme: ${scheme})">`,
    )
    .join('')
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
}

describe('theme', () => {
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    document.head.innerHTML = ''
  })

  it('reads System when nothing is saved, or something unknown is', () => {
    expect(readTheme()).toBe('system')
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(readTheme()).toBe('system')
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readTheme(blocked)).toBe('system')
  })

  it('saves Light or Dark on this device, and System clears it', () => {
    saveTheme('dark')
    expect(readTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    saveTheme('system')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('points the browser frame colour at the chosen theme', () => {
    const [light, dark] = metas()
    applyTheme('dark')
    expect([light?.media, dark?.media]).toEqual(['not all', 'all'])
    applyTheme('light')
    expect([light?.media, dark?.media]).toEqual(['all', 'not all'])
    applyTheme('system')
    expect([light?.media, dark?.media]).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ])
  })

  it('matches the early script in index.html, which runs before the app', () => {
    const html = readFileSync(resolve(import.meta.dirname, '..', '..', 'index.html'), 'utf8')
    expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(html).toContain("theme === 'light' || theme === 'dark'")
  })
})
