/**
 * Colours that have to exist outside CSS (the web app manifest, <meta name="theme-color">,
 * icon backgrounds), read from src/theme/tokens.css so the look stays defined once
 * (CLAUDE.md, "Design rules").
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tokens = () =>
  readFileSync(resolve(import.meta.dirname, '..', 'src', 'theme', 'tokens.css'), 'utf8')

/** The light and dark values of a `--name: light-dark(<light>, <dark>)` token. */
export function tokenColors(name: string, css: string = tokens()): { light: string; dark: string } {
  const match = new RegExp(
    `--${name}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{3,8})\\s*,\\s*(#[0-9a-fA-F]{3,8})\\s*\\)`,
  ).exec(css)
  if (!match?.[1] || !match[2]) throw new Error(`tokens.css has no light-dark() colour --${name}`)
  return { light: match[1], dark: match[2] }
}
