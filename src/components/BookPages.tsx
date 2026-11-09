import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useBookPages, type PageLinks } from '@/lib/book-pages'
import { cn } from '@/lib/utils'

/** A printed page's shape (the book is US letter), so nothing jumps while it loads. */
const PAGE_ASPECT = 'aspect-[1400/1818]'

/**
 * A session's pages as a grid (three across on a phone, five on a laptop). Choosing one
 * opens it full size in a viewer that steps through the rest.
 */
export function PageGrid({ slug, pages }: { slug: string; pages: readonly number[] }) {
  const links = useBookPages(slug, pages)
  const [open, setOpen] = useState<number | null>(null)
  if (pages.length === 0) return null
  return (
    <>
      <ol aria-label="The pages" className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {pages.map((page, i) => (
          <li key={page}>
            <button
              type="button"
              onClick={() => {
                setOpen(i)
              }}
              aria-label={`Open page ${String(page)}`}
              className="flex w-full flex-col gap-1 rounded-md text-left transition-opacity hover:opacity-80"
            >
              <PageImage page={page} links={links.data} loading={links.isPending} thumbnail />
              <span className="text-small text-muted-foreground tabular-nums">Page {page}</span>
            </button>
          </li>
        ))}
      </ol>
      <PageViewer pages={pages} links={links.data} at={open} onAt={setOpen} />
    </>
  )
}

/** One page as large as the screen allows, with the previous and next ones a key away. */
function PageViewer({
  pages,
  links,
  at,
  onAt,
}: {
  pages: readonly number[]
  links: PageLinks | undefined
  at: number | null
  onAt: (at: number | null) => void
}) {
  const page = at === null ? undefined : pages[at]
  const link = page === undefined ? null : (links?.[page] ?? null)
  const go = (step: 1 | -1) => {
    if (at === null) return
    const next = at + step
    if (next >= 0 && next < pages.length) onAt(next)
  }
  return (
    <Dialog.Root
      open={at !== null}
      onOpenChange={(open) => {
        if (!open) onAt(null)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/95" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1)
            if (e.key === 'ArrowLeft') go(-1)
          }}
          className="fixed inset-0 flex flex-col items-center gap-3 p-3 sm:p-6"
        >
          <div className="flex w-full max-w-3xl items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-foreground">
            <Dialog.Title className="text-body tabular-nums">
              Page {page}{' '}
              <span className="text-muted-foreground">
                · {(at ?? 0) + 1} of {pages.length}
              </span>
            </Dialog.Title>
            <div className="flex items-center gap-1">
              {link ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    Full size
                    <ExternalLink aria-hidden />
                    <span className="sr-only"> (opens a new tab)</span>
                  </a>
                </Button>
              ) : null}
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" aria-label="Close">
                  <X aria-hidden />
                </Button>
              </Dialog.Close>
            </div>
          </div>
          <div className="flex min-h-0 w-full max-w-3xl flex-1 items-center justify-center">
            {page !== undefined ? (
              link ? (
                <img
                  src={link}
                  alt={`Page ${String(page)} of the book`}
                  width={1400}
                  height={1818}
                  className="max-h-full w-auto max-w-full rounded-md border border-border bg-card object-contain"
                />
              ) : (
                <p className="text-muted-foreground">Page {page} isn’t in the app yet.</p>
              )
            ) : null}
          </div>
          <div className="flex w-full max-w-3xl justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                go(-1)
              }}
              disabled={at === null || at === 0}
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                go(1)
              }}
              disabled={at === null || at === pages.length - 1}
            >
              Next
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PageImage({
  page,
  links,
  loading,
  thumbnail = false,
}: {
  page: number
  links: PageLinks | undefined
  loading: boolean
  thumbnail?: boolean
}) {
  const link = links?.[page] ?? null
  const frame = cn('w-full rounded-md border border-border bg-card', PAGE_ASPECT)
  if (link) {
    return (
      <img
        src={link}
        alt={`Page ${String(page)} of the book`}
        loading={thumbnail ? 'eager' : 'lazy'}
        decoding="async"
        width={1400}
        height={1818}
        className={cn(frame, 'object-contain')}
      />
    )
  }
  return (
    <div
      role={loading ? undefined : 'img'}
      aria-label={loading ? undefined : `Page ${String(page)} isn’t in the app yet`}
      className={cn(
        frame,
        'flex items-center justify-center p-1 text-center text-caption text-muted-foreground',
        loading && 'animate-pulse bg-muted',
      )}
    />
  )
}
