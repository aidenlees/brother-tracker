import { Lock } from 'lucide-react'
import { Link } from 'react-router'
import { Page } from '@/components/Page'
import { formatDay } from '@/lib/dates'
import type { EntryView } from '@/lib/outbox/overlay'
import type { Tracker } from '@/lib/student-data'
import { shownFields } from '@/trackers/entry'
import { FIELD_REGISTRY } from '@/trackers/fields/registry'
import { sessionLabel, type PlanItem } from '@/trackers/plan'

/** An entry past its 7 days (CLAUDE.md, security rule 3): readable, no longer changeable. */
export function LockedEntry({
  tracker,
  plan,
  entry,
}: {
  tracker: Tracker
  plan: PlanItem | null
  entry: EntryView
}) {
  const fields = shownFields(tracker.fields, entry.data, plan?.details ?? null).filter(
    (field) => entry.data[field.key] !== undefined,
  )
  return (
    <Page
      title={tracker.name}
      lead={[plan ? sessionLabel(plan.details) : null, formatDay(entry.date, 'long')]
        .filter(Boolean)
        .join(' · ')}
    >
      <p className="flex items-center gap-2 text-muted-foreground">
        <Lock aria-hidden className="size-4" />
        Locked: entries can be changed for 7 days after they’re logged.
      </p>
      <dl className="flex max-w-xl flex-col gap-4">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{field.label}</dt>
            <dd className="whitespace-pre-line text-foreground">
              {FIELD_REGISTRY[field.type].summary(entry.data[field.key], field)}
            </dd>
          </div>
        ))}
      </dl>
      <Link to="/today" className="text-foreground underline underline-offset-4">
        Back to Today
      </Link>
    </Page>
  )
}
