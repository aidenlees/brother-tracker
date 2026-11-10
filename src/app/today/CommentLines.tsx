import { useId } from 'react'
import { Link } from 'react-router'
import { Thread } from '@/components/Comments'
import { authorNames, useEntryComments, type Comment } from '@/lib/comments'
import { formatDay } from '@/lib/dates'
import type { EntryView } from '@/lib/outbox/overlay'
import { sessionLabel, type PlanItem } from '@/trackers/plan'

/**
 * Comments from the last week on this tracker's logs, one line per log, newest first:
 * "Alex commented on Session 4 · Bar Models". A session's line opens its page, where the
 * conversation is and the student replies; a log with no session opens it right here.
 */
export function CommentLines({
  comments,
  entries,
  items,
}: {
  /** Recent comments by others, on any of the student's logs. */
  comments: readonly Comment[]
  entries: readonly EntryView[]
  items: readonly PlanItem[]
}) {
  const headingId = useId()
  const byEntry = new Map<string, Comment[]>()
  for (const comment of comments) {
    if (!entries.some((e) => e.id === comment.entryId)) continue
    byEntry.set(comment.entryId, [...(byEntry.get(comment.entryId) ?? []), comment])
  }
  if (byEntry.size === 0) return null

  const latest = (list: Comment[]) => list.at(-1)?.createdAt ?? ''
  const threads = [...byEntry].sort(([, a], [, b]) => (latest(a) < latest(b) ? 1 : -1))

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-border pt-6"
    >
      <h3 id={headingId} className="text-body text-foreground">
        Comments
      </h3>
      <ul className="flex flex-col gap-3">
        {threads.map(([entryId, list]) => {
          const entry = entries.find((e) => e.id === entryId)
          if (!entry) return null
          const item = items.find((i) => i.id === entry.plan_item_id)
          const names = authorNames(list)
          if (item) {
            return (
              <li key={entryId}>
                <Link
                  to={`/session/${item.assignment_id}/${item.id}`}
                  className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
                >
                  {names} commented on {sessionLabel(item.details) ?? item.title}
                </Link>
              </li>
            )
          }
          return (
            <li key={entryId}>
              <details className="group flex flex-col gap-4">
                <summary className="cursor-pointer text-foreground underline underline-offset-4 hover:text-muted-foreground">
                  {names} commented on your log for {formatDay(entry.date)}
                </summary>
                <div className="pt-4">
                  <InlineThread entryId={entryId} />
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The whole conversation, for a log with no session page. */
function InlineThread({ entryId }: { entryId: string }) {
  const comments = useEntryComments(entryId)
  if (comments.status === 'pending') {
    return (
      <p role="status" className="text-small text-muted-foreground">
        Loading…
      </p>
    )
  }
  if (comments.status === 'error') {
    return (
      <p className="text-small text-muted-foreground">
        Couldn’t load the comments. Check your connection, then reload.
      </p>
    )
  }
  return <Thread entryId={entryId} comments={comments.data} heading="h4" prompt="Reply" />
}
