import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cn, TYPE_SIZES } from './utils'

describe('cn', () => {
  it('keeps a type size beside a text colour', () => {
    expect(cn('text-small font-medium', 'text-foreground')).toBe(
      'text-small font-medium text-foreground',
    )
  })

  it('lets a later size or colour replace an earlier one', () => {
    expect(cn('text-small', 'text-body')).toBe('text-body')
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground')
  })

  it('knows exactly the sizes tokens.css defines', () => {
    const css = readFileSync('src/theme/tokens.css', 'utf8')
    const defined = [...css.matchAll(/--text-([a-z]+):/g)].map((m) => m[1])
    expect(defined).toEqual([...TYPE_SIZES])
  })
})
