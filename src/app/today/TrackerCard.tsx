import { Check, TriangleAlert } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import type { Sync } from '@/lib/outbox/overlay'
import { cn } from '@/lib/utils'
import type { TrackerAccent } from '@/theme/accents'
import { TrackerIcon } from '@/trackers/TrackerIcon'

/** One tracker on Today: its accent, icon and name, a streak if it keeps one, and its body. */
export function TrackerCard({
  name,
  icon,
  color,
  aside,
  children,
}: {
  name: string
  icon: string
  color: TrackerAccent
  aside?: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      style={{ '--tracker': `var(--tracker-${color})` } as CSSProperties}
      className="flex flex-col gap-5 rounded-lg border border-l-[3px] border-border border-l-tracker bg-card p-6"
    >
      <header className="flex items-center gap-3">
        <TrackerIcon name={icon} className="size-5 shrink-0 text-tracker" />
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {name}
        </h2>
        {aside ? (
          <p className="ml-auto text-small whitespace-nowrap text-muted-foreground tabular-nums">
            {aside}
          </p>
        ) : null}
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
