import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useOutbox } from '@/lib/outbox/outbox-context'
import type { FollowupView } from '@/lib/outbox/overlay'
import type { FollowupStatus } from '@/lib/outbox/types'
import type { FollowupRules } from '@/trackers/definition'
import { dueLabel, listsAllOpen } from '@/trackers/followups'
import type { PlanItem } from '@/trackers/plan'

/**
 * Retries on a tracker's card: the ones due by today, or, on a review session, every
 * one still open, oldest first. Done and Drop take a tap; a row closed this visit stays,
 * with Undo, until the student leaves the screen.
 */
export function Retries({
  rules,
  followups,
  todaysItems,
  today,
}: {
  rules: FollowupRules
  followups: FollowupView[]
  todaysItems: PlanItem[]
  today: string
}) {
  const outbox = useOutbox()
  const headingId = useId()
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const review = todaysItems.some((item) => listsAllOpen(rules, item.details))

  const shown = followups
    .filter((f) => (f.status === 'open' ? review || f.due_date <= today : closed.has(f.id)))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
  if (shown.length === 0) return null

  async function set(followup: FollowupView, status: FollowupStatus) {
    setClosed((ids) => new Set([...ids, followup.id]))
    await outbox.enqueue({ kind: 'followup.update', id: followup.id, patch: { status } })
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-5"
    >
      <h3 id={headingId} className="font-sans text-base font-medium text-foreground">
        {review ? 'Every open retry, for today’s review' : 'Retries due'}
      </h3>
      <ul className="flex flex-col gap-2">
        {shown.map((f) => (
          <li key={f.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <span className="flex flex-wrap items-baseline gap-x-3">
              <span
                className={
                  f.status === 'open' ? 'text-foreground' : 'text-muted-foreground line-through'
                }
              >
                {f.label}
              </span>
              <span className="text-sm text-muted-foreground">{dueLabel(f.due_date, today)}</span>
            </span>
            <span className="flex items-center gap-1">
              {f.status === 'open' ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Done: ${f.label}`}
                    onClick={() => void set(f, 'done')}
                  >
                    <Check aria-hidden />
                    Done
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Drop: ${f.label}`}
                    onClick={() => void set(f, 'dropped')}
                  >
                    Drop
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">
                    {f.status === 'done' ? 'Done' : 'Dropped'}
                  </span>
                  <Button
                    size="sm"
                    variant="link"
                    aria-label={`Undo: ${f.label}`}
                    onClick={() =>
                      void outbox.enqueue({
                        kind: 'followup.update',
                        id: f.id,
                        patch: { status: 'open' },
                      })
                    }
                  >
                    Undo
                  </Button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
