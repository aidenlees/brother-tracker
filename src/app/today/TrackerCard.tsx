import { Check, TriangleAlert } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import type { Sync } from '@/lib/outbox/overlay'
import { cn } from '@/lib/utils'
import type { TrackerAccent } from '@/theme/accents'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/** One tracker on Today: its accent, icon and name, and its body. */
export function TrackerCard({
  name,
  icon,
  color,
  children,
}: {
  name: string
  icon: string
  color: TrackerAccent
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      style={{ '--tracker': `var(--tracker-${color})` } as CSSProperties}
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-5 sm:p-6"
    >
      <header className="flex items-center gap-3">
        <TrackerIcon name={icon} className="size-5 shrink-0 text-tracker" />
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {name}
        </h2>
      </header>
      {children}
    </section>
  )
}

/** "Saved", with where the save is: on this device (waiting to sync) or on the server. */
export function SavedNote({
  sync,
  reason,
  fresh = false,
}: {
  sync: Sync
  reason?: string
  /** Just saved: the check mark eases in. */
  fresh?: boolean
}) {
  if (sync === 'parked') {
    return (
      <p className="flex items-start gap-2 text-small text-destructive">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Couldn’t sync. {reason}</span>
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-small text-foreground">
      <Check aria-hidden className={cn('size-4 text-tracker', fresh && 'animate-check')} />
      <span>Saved</span>
      <span className="text-muted-foreground">
        {sync === 'synced' ? '· Synced' : '· On this device, will sync'}
      </span>
    </p>
  )
}
