import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { useBookPages, type PageLinks } from '@/lib/book-pages'
import { cn } from '@/lib/utils'

/** A printed page's shape (the book is US letter), so nothing jumps while it loads. */
const PAGE_ASPECT = 'aspect-[1400/1818]'

/**
 * Small images of a session's pages, each opening the session's page view. Shows the
 * first few and says how many more there are.
 */
export function PageThumbnails({
  slug,
  pages,
  href,
  limit = 4,
}: {
  slug: string
  pages: readonly number[]
  href: string
  limit?: number
}) {
  const links = useBookPages(slug, pages)
  if (pages.length === 0) return null
  const shown = pages.slice(0, limit)
  const more = pages.length - shown.length
  return (
    <ul aria-label="Pages to work on" className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {shown.map((page) => (
        <li key={page}>
          <Link
            to={href}
            aria-label={`Page ${String(page)}, open the session’s pages`}
            className="flex flex-col gap-1 rounded-md transition-opacity hover:opacity-80"
          >
            <PageImage page={page} links={links.data} loading={links.isPending} thumbnail />
            <span className="text-caption text-muted-foreground tabular-nums">p. {page}</span>
          </Link>
        </li>
      ))}
      {more > 0 ? (
        <li>
          <Link
            to={href}
            className={cn(
              'flex items-center justify-center rounded-md border border-border bg-muted text-small text-muted-foreground transition-colors hover:text-foreground',
              PAGE_ASPECT,
            )}
          >
            +{more} more
          </Link>
        </li>
      ) : null}
    </ul>
  )
}

/** Every page of a session, large, one under another; each opens full size. */
export function PageImages({ slug, pages }: { slug: string; pages: readonly number[] }) {
  const links = useBookPages(slug, pages)
  if (pages.length === 0) return null
  return (
    <ol aria-label="The pages" className="flex flex-col gap-8">
      {pages.map((page) => {
        const link = links.data?.[page] ?? null
        return (
          <li key={page}>
            <figure className="flex flex-col gap-2">
              <PageImage page={page} links={links.data} loading={links.isPending} />
              <figcaption className="flex items-center justify-between text-small text-muted-foreground">
                <span className="tabular-nums">Page {page}</span>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Full size
                    <ExternalLink aria-hidden className="size-3.5" />
                    <span className="sr-only"> (page {page}, opens a new tab)</span>
                  </a>
                ) : null}
              </figcaption>
            </figure>
          </li>
        )
      })}
    </ol>
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
        'flex items-center justify-center p-2 text-center text-caption text-muted-foreground',
        loading && 'animate-pulse bg-muted',
      )}
    >
      {loading || thumbnail ? null : `Page ${String(page)} isn’t in the app yet.`}
    </div>
  )
}
