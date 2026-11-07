/**
 * The printed book's pages, from the private `book-pages` bucket (CLAUDE.md, rule 9):
 * signed links that last 10 minutes, asked for together and reused for 9. They are not
 * kept on the device (an expired link is no use offline). RLS decides who may sign one:
 * whoever can see a student actively assigned the tracker.
 */
import { useQuery } from '@tanstack/react-query'
import { useOutbox } from './outbox/outbox-context'
import { supabase } from './supabase'

export const PAGE_LINK_SECONDS = 600

/** "singapore-math/031.webp" */
export function pagePath(slug: string, page: number): string {
  return `${slug}/${String(page).padStart(3, '0')}.webp`
}

/** Each page's signed link, or null when that page isn't in the bucket. */
export type PageLinks = Readonly<Record<number, string | null>>

export function useBookPages(slug: string | undefined, pages: readonly number[]) {
  const { userId } = useOutbox()
  return useQuery({
    queryKey: [userId, 'book-pages', slug, pages],
    enabled: slug !== undefined && pages.length > 0,
    staleTime: 9 * 60_000,
    gcTime: 10 * 60_000,
    meta: { persist: false },
    queryFn: async (): Promise<PageLinks> => {
      const book = slug ?? ''
      const { data, error } = await supabase.storage.from('book-pages').createSignedUrls(
        pages.map((page) => pagePath(book, page)),
        PAGE_LINK_SECONDS,
      )
      if (error) throw error
      return Object.fromEntries(
        pages.map((page, i) => {
          const link = data[i]
          return [page, link && !link.error && link.signedUrl ? link.signedUrl : null]
        }),
      )
    },
  })
}
