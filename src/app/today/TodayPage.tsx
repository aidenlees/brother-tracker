import { EmptyNote, Page } from '@/components/Page'
import { longDateInNewYork } from '@/lib/dates'

export function TodayPage() {
  return (
    <Page title="Today" lead={longDateInNewYork()}>
      <EmptyNote>Your trackers will show up here once your admin assigns them.</EmptyNote>
    </Page>
  )
}
