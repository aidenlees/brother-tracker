import { Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

/** A screen's code that couldn't be fetched: offline before the app was installed. */
function isMissingChunk(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message,
    )
  )
}

/**
 * Shown instead of a screen that failed. Entries are never lost here: drafts and the
 * outbox live in IndexedDB, apart from the screen that failed.
 */
export function RouteError() {
  const error = useRouteError()
  const missing = isMissingChunk(error)
  return (
    <section role="alert" className="flex max-w-xl flex-col gap-4">
      <h1 className="text-3xl text-foreground">
        {missing ? 'This screen isn’t on this device yet' : 'Something went wrong'}
      </h1>
      <p className="text-muted-foreground">
        {missing
          ? 'Reconnect to the internet, then reload. Anything you saved is still on this device.'
          : 'Reload to try again. Anything you saved is still on this device.'}
      </p>
      <div className="flex gap-3">
        <Button
          onClick={() => {
            window.location.reload()
          }}
        >
          Reload
        </Button>
        <Button asChild variant="outline">
          <Link to="/" reloadDocument>
            Go to the start
          </Link>
        </Button>
      </div>
    </section>
  )
}

/** The same, for a failure outside the signed-in frame (no header around it). */
export function RouteErrorPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <RouteError />
    </main>
  )
}
