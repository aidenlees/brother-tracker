import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * "Clear this log", for one made by mistake or that doesn't say what happened: a tap to
 * ask, a second to confirm, with "Keep it" focused so Enter never clears by accident.
 * Clearing can't be undone, so the question says what goes with it.
 */
export function ClearLog({
  noun = 'log',
  retries = 0,
  comments = 0,
  note,
  onClear,
}: {
  /** What's being cleared: "log", or "check-in" on a daily card. */
  noun?: string
  /** What goes with it, said in the question: "with its 2 retries and 1 comment". */
  retries?: number
  comments?: number
  /** One more sentence for the question, if needed. */
  note?: string
  onClear: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const keep = useRef<HTMLButtonElement>(null)
  const ask = useRef<HTMLButtonElement>(null)
  const questionId = useId()
  const wasAsking = useRef(false)

  useEffect(() => {
    if (asking) keep.current?.focus()
    else if (wasAsking.current) ask.current?.focus()
    wasAsking.current = asking
  }, [asking])

  // data-flow-nav: the log flow leaves Enter to these buttons instead of moving on.
  if (!asking) {
    return (
      <div data-flow-nav>
        <Button
          ref={ask}
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-muted-foreground"
          onClick={() => {
            setAsking(true)
          }}
        >
          Clear this {noun}
        </Button>
      </div>
    )
  }
  return (
    <div
      data-flow-nav
      role="group"
      aria-labelledby={questionId}
      className="flex max-w-prose flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setAsking(false)
      }}
    >
      <p id={questionId} className="text-foreground">
        Clear this {noun}? It’s removed for good{goesWith(retries, comments)}.
        {note ? ` ${note}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={clearing}
          onClick={() => {
            setClearing(true)
            void onClear().finally(() => {
              setClearing(false)
            })
          }}
        >
          Clear it
        </Button>
        <Button
          ref={keep}
          type="button"
          variant="outline"
          onClick={() => {
            setAsking(false)
          }}
        >
          Keep it
        </Button>
      </div>
    </div>
  )
}

/** ", with its 2 retries and 1 comment", or "" when nothing else goes. */
function goesWith(retries: number, comments = 0): string {
  const parts = [
    retries > 0 ? (retries === 1 ? '1 retry' : `${retries} retries`) : null,
    comments > 0 ? (comments === 1 ? '1 comment' : `${comments} comments`) : null,
  ].filter(Boolean)
  return parts.length > 0 ? `, with its ${parts.join(' and ')}` : ''
}
