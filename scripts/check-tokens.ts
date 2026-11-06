/**
 * Fails if any file under src/ hard-codes a colour, font family, font size or radius
 * instead of using a token (CLAUDE.md, "Design rules": components never hard-code them).
 * Type uses the six named sizes in tokens.css (text-display … text-caption) and two
 * weights (normal, medium). The one allowed home for literal values is tokens.css.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = 'src'
const ALLOWED = new Set([join('src', 'theme', 'tokens.css')])
const EXTENSIONS = /\.(ts|tsx|css)$/

const RULES: { name: string; pattern: RegExp }[] = [
  { name: 'hex colour', pattern: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi },
  { name: 'colour function', pattern: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/gi },
  { name: 'font-family declaration', pattern: /font-family\s*:/gi },
  { name: 'font-size declaration', pattern: /font-size\s*:/gi },
  { name: 'arbitrary font class', pattern: /\bfont-\[/g },
  // tokens.css clears Tailwind's sizes, so one of these would otherwise vanish silently.
  { name: 'size outside the type scale', pattern: /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/g },
  {
    name: 'weight outside the type scale',
    pattern: /\bfont-(?:thin|extralight|light|semibold|bold|extrabold|black)\b/g,
  },
  { name: 'arbitrary radius class', pattern: /\brounded(?:-[a-z]+)?-\[/g },
  {
    name: 'arbitrary colour class',
    pattern: /\b(?:bg|text|border|ring|outline|fill|stroke)-\[(?!var\()/g,
  },
]

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (EXTENSIONS.test(entry.name)) yield path
  }
}

const problems: string[] = []
for (const file of files(ROOT)) {
  if (ALLOWED.has(file)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        const where = `${relative('.', file).split(sep).join('/')}:${index + 1}`
        problems.push(`${where}  ${rule.name}: ${match[0]}`)
      }
    }
  })
}

if (problems.length > 0) {
  console.error('Hard-coded design values found. Use tokens from src/theme/tokens.css:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('check:tokens: no hard-coded colours, fonts, sizes or radii in src/')
