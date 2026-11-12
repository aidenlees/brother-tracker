import { useEffect, type ReactNode } from 'react'
import { note } from './sheet'

const APP_NAME = 'Practice tracker'

/** One screen: sets the tab title and renders its heading. Each screen answers one question. */
export function Page({
  title,
  lead,
  back,
  children,
}: {
  title: string
  lead?: ReactNode
  /** Links back to where the student came from, above the title. */
  back?: ReactNode
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} – ${APP_NAME}`
  }, [title])

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        {back ? <div className="mb-3">{back}</div> : null}
        <h1 id="page-title" className="font-heading text-display text-foreground">
          {title}
        </h1>
        {lead ? <p className="text-body text-muted-foreground">{lead}</p> : null}
      </header>
      {children}
    </section>
  )
}

/** A quiet note for a screen with nothing in it yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={note('max-w-prose')}>{children}</p>
}
