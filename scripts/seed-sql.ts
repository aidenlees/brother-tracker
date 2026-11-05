/**
 * Builds the SQL behind `pnpm seed`: one DO block (a single statement, so it is atomic
 * and `supabase db query` accepts it) that upserts the launch trackers by slug and their
 * plan templates by tracker and name. Rows whose content hasn't changed are left alone,
 * so re-running changes nothing and writes no audit rows. A separate read-only query
 * reports the counts. People are never touched (CLAUDE.md, "Adding people").
 */
import type { PlanFile, TrackerDefinition } from '../src/trackers/definition.ts'

/** The template name `pnpm seed` owns. Templates the admin creates are left alone. */
export const SEED_TEMPLATE_NAME = 'Launch plan'

export type SeedInput = {
  trackers: TrackerDefinition[]
  /** Plan files by tracker slug, for trackers whose cadence names a plan_source. */
  plans: Map<string, PlanFile>
}

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function json(value: unknown): string {
  return `${literal(JSON.stringify(value))}::jsonb`
}

function trackerRow(tracker: TrackerDefinition): string {
  // plan_source is a seed-time pointer to a repo file, not runtime data.
  const cadence = { type: tracker.cadence.type }
  const values = [
    literal(tracker.slug),
    literal(tracker.name),
    literal(tracker.icon),
    literal(tracker.color),
    String(tracker.sort),
    json(cadence),
    json(tracker.fields),
    json(tracker.metrics),
    tracker.followups ? json(tracker.followups) : 'null',
    json(tracker.pacingFlags ?? []),
    tracker.display ? literal(tracker.display) : 'null',
  ]
  return `  (${values.join(', ')})`
}

function templateItems(plan: PlanFile) {
  return plan.sessions.map((s) => ({
    date: s.date,
    title: s.assignment,
    sort: s.session,
    details: {
      session: s.session,
      week: s.week,
      topic: s.topic,
      assignment: s.assignment,
      page_start: s.page_start,
      page_end: s.page_end,
      kind: s.kind,
      reading_only: s.reading_only,
    },
  }))
}

const TRACKER_COLUMNS = [
  'name',
  'icon',
  'color',
  'sort',
  'cadence',
  'fields',
  'metrics',
  'followups',
  'pacing_flags',
  'display',
]

const BODY_TAG = '$seed$'

export const SEED_SUMMARY_SQL = [
  'select',
  '  (select count(*) from public.trackers) as trackers,',
  '  (select count(*) from public.tracker_versions) as tracker_versions,',
  '  (select count(*) from public.plan_templates) as plan_templates,',
  '  (select coalesce(sum(jsonb_array_length(items)), 0) from public.plan_templates) as template_items',
].join('\n')

export function buildSeedSql({ trackers, plans }: SeedInput): string {
  const sql: string[] = []

  sql.push(
    'insert into public.trackers (slug, name, icon, color, sort, cadence, fields, metrics, followups, pacing_flags, display)',
    'values',
    trackers.map(trackerRow).join(',\n'),
    'on conflict (slug) do update set',
    TRACKER_COLUMNS.map((c) => `  ${c} = excluded.${c}`).join(',\n'),
    `where (${TRACKER_COLUMNS.map((c) => `trackers.${c}`).join(', ')})`,
    `  is distinct from (${TRACKER_COLUMNS.map((c) => `excluded.${c}`).join(', ')});`,
    '',
  )

  for (const tracker of trackers) {
    const plan = plans.get(tracker.slug)
    if (!plan) continue
    const firstDate = plan.sessions.map((s) => s.date).sort()[0] ?? ''
    sql.push(
      'insert into public.plan_templates (tracker_id, name, first_date, items)',
      `select t.id, ${literal(SEED_TEMPLATE_NAME)}, date ${literal(firstDate)}, ${json(templateItems(plan))}`,
      `from public.trackers t where t.slug = ${literal(tracker.slug)}`,
      'on conflict (tracker_id, name) do update set',
      '  first_date = excluded.first_date,',
      '  items = excluded.items',
      'where (plan_templates.first_date, plan_templates.items)',
      '  is distinct from (excluded.first_date, excluded.items);',
      '',
    )
  }

  const body = sql.join('\n')
  if (body.includes(BODY_TAG)) {
    throw new Error(`Seed content contains the reserved delimiter ${BODY_TAG}`)
  }
  return `do ${BODY_TAG}\nbegin\n${body}\nend\n${BODY_TAG};\n`
}
