import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The type sizes in src/theme/tokens.css (--text-<name>). tailwind-merge has to know
 * them: it reads any unknown text-* class as a colour, so `text-small text-foreground`
 * would lose the size. utils.test.ts keeps this list and tokens.css in step.
 */
export const TYPE_SIZES = ['display', 'title', 'lead', 'body', 'small', 'caption'] as const

const twMerge = extendTailwindMerge({ extend: { theme: { text: [...TYPE_SIZES] } } })

/** Join class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
