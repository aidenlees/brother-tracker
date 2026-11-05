// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TRACKER_ACCENTS } from './accents'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const seed = JSON.parse(
  readFileSync(new URL('../../seed/trackers.json', import.meta.url), 'utf8'),
) as { trackers: { slug: string; color: string }[] }

type Pair = { light: string; dark: string }

/** Every `--name: light-dark(#light, #dark);` declaration in tokens.css. */
const tokens = new Map<string, Pair>(
  [...css.matchAll(/--([a-z-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/g)].map((m) => [
    m[1] ?? '',
    { light: m[2] ?? '', dark: m[3] ?? '' },
  ]),
)

function token(name: string): Pair {
  const value = tokens.get(name)
  if (!value) throw new Error(`tokens.css has no light-dark() token --${name}`)
  return value
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const accents = [...tokens.keys()].filter((name) => name.startsWith('tracker-'))
const themes = ['light', 'dark'] as const

describe('design tokens', () => {
  it('defines exactly six tracker accents', () => {
    expect(accents).toHaveLength(6)
  })

  it('matches TRACKER_ACCENTS, the list tracker definitions validate against', () => {
    expect(accents.map((a) => a.replace('tracker-', ''))).toEqual([...TRACKER_ACCENTS])
  })

  it('has an accent for every launch tracker colour', () => {
    for (const tracker of seed.trackers) {
      expect(accents, tracker.slug).toContain(`tracker-${tracker.color}`)
    }
  })

  describe.each(themes)('%s theme', (theme) => {
    const on = (fg: string, bg: string) => contrast(token(fg)[theme], token(bg)[theme])

    it.each([
      ['ink', 'paper'],
      ['ink', 'surface'],
      ['ink', 'muted-fill'],
      ['ink-muted', 'paper'],
      ['ink-muted', 'surface'],
      ['ink-muted', 'muted-fill'],
      ['danger', 'paper'],
      ['danger', 'surface'],
      ['paper', 'ink'],
    ])('%s text on %s reaches 4.5:1', (fg, bg) => {
      expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each([
      ['field-border', 'paper'],
      ['field-border', 'surface'],
      ['focus', 'paper'],
      ['focus', 'surface'],
    ])('%s on %s reaches 3:1', (fg, bg) => {
      expect(on(fg, bg)).toBeGreaterThanOrEqual(3)
    })

    it.each(accents)('%s reaches 4.5:1 as text and as a fill', (accent) => {
      expect(on(accent, 'paper')).toBeGreaterThanOrEqual(4.5)
      expect(on(accent, 'surface')).toBeGreaterThanOrEqual(4.5)
      expect(on('paper', accent)).toBeGreaterThanOrEqual(4.5)
    })
  })
})
