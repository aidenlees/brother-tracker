import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Multi-line text that grows with its content (where the browser supports it). */
export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-24 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5',
        'text-base leading-relaxed text-foreground placeholder:text-muted-foreground',
        'disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}
