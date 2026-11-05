import { EmptyNote, Page } from '@/components/Page'

/** Stand-in for screens later phases build. */
export function NotBuiltPage({ title }: { title: string }) {
  return (
    <Page title={title}>
      <EmptyNote>This page isn’t built yet.</EmptyNote>
    </Page>
  )
}
