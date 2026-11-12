/**
 * The page is a ruled notebook page, not a stack of boxes (CLAUDE.md, "Design rules";
 * the look of 2026-11-12). Two shapes, used everywhere a card used to be:
 *
 * - a sheet: one of a page's sections. It starts on a 2 px rule across the column, in
 *   the tracker's accent when it belongs to one (set `--tracker` on it), in ink when not.
 * - a leaf: one item in a ruled list (a log, a struggle, a session, a day), on a hairline.
 *
 * Neither has a background, border box or radius: the paper shows through.
 */
import { cn } from '@/lib/utils'

export function sheet(tracker = false, className?: string): string {
  return cn(
    'flex flex-col gap-6 border-t-2 pt-5',
    tracker ? 'border-tracker' : 'border-foreground',
    className,
  )
}

export function leaf(className?: string): string {
  return cn('flex flex-col gap-4 border-t border-border pt-5', className)
}

/**
 * A note to the reader (a confirmation with Undo, a new version, an empty list): a 2 px
 * ink bar down its left, like a pencil mark in the margin.
 */
export function note(className?: string): string {
  return cn('border-l-2 border-foreground py-1 pl-4 text-foreground', className)
}

/** Space between sheets on a page, wider than inside one, so each reads as its own. */
export const SHEETS_GAP = 'gap-12'
