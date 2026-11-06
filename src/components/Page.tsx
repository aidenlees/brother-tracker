import { useEffect, type ReactNode } from 'react'

const APP_NAME = 'Practice tracker'

/** One screen: sets the tab title and renders its heading. Each screen answers one question. */
export function Page({
  title,
  lead,
  children,
}: {
  title: string
  lead?: ReactNode
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} – ${APP_NAME}`
  }, [title])

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
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
  return (
    <p className="max-w-prose rounded-lg border border-border bg-card px-5 py-4 text-foreground">
      {children}
    </p>
  )
}
