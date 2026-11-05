import { Check, CloudOff, HardDrive, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOutbox } from '@/lib/outbox/outbox-context'
import type { OutboxItem } from '@/lib/outbox/types'

function describeOp(item: OutboxItem): string {
  switch (item.op.kind) {
    case 'entry.create':
    case 'entry.update':
      return 'An entry'
    case 'followup.create':
    case 'followup.update':
      return 'A retry'
    case 'photo.upload':
      return 'A photo'
  }
}

/**
 * Where the student's saves are (CLAUDE.md, "Offline"): on this device and waiting, or
 * on the server. Refused saves are listed with the reason; nothing is dropped unless the
 * student chooses to.
 */
export function SyncStatus({ offline: signedInOffline }: { offline: boolean }) {
  const outbox = useOutbox()
  const offline = signedInOffline || outbox.offline

  return (
    <div className="flex items-center gap-3 text-sm" aria-live="polite">
      {outbox.parked.length > 0 ? (
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-destructive">
            <TriangleAlert aria-hidden className="size-4" />
            Couldn’t sync{' '}
            {outbox.parked.length === 1 ? '1 change' : `${outbox.parked.length} changes`}
          </summary>
          <div className="absolute right-0 z-10 mt-2 flex w-80 flex-col gap-3 rounded-lg border border-border bg-card p-4 text-foreground">
            <p className="text-muted-foreground">
              These are still on this device. Change them and save again, or discard them.
            </p>
            <ul className="flex flex-col gap-3">
              {outbox.parked.map((item) => (
                <li key={item.key} className="flex flex-col gap-1.5">
                  <span>
                    {describeOp(item)}: {item.parked?.reason}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      void outbox.discard(item.key)
                    }}
                  >
                    Discard this change
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
      {outbox.pending > 0 ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <HardDrive aria-hidden className="size-4" />
          Saved on this device, will sync
        </span>
      ) : outbox.syncing ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw aria-hidden className="size-4" />
          Syncing…
        </span>
      ) : offline ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <CloudOff aria-hidden className="size-4" />
          Offline. Saves stay on this device.
        </span>
      ) : outbox.parked.length === 0 ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Check aria-hidden className="size-4" />
          Synced
        </span>
      ) : null}
    </div>
  )
}
