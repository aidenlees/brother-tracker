import { z } from 'zod'
import { cn } from '@/lib/utils'
import { defineFieldType, planList, type FieldProps } from './contract'

/** The items checked, in the plan's order: ["p. 31 #4", "p. 32 #5(b)"]. */
export type Picked = string[]

const PLAN_REF = /^plan\.[a-z][a-z0-9_]*$/

/**
 * One checkbox per item the plan item lists (optionsFrom, e.g. "plan.problems"). The
 * math log asks "Which problems did you struggle with?" with it. Checking none is an
 * answer. Mirrors public.field_check_plan_checklist, check for check.
 */
export default defineFieldType<Picked>({
  schema: (field, plan) =>
    z.custom<Picked>().superRefine((value, ctx) => {
      const fail = (message: string) => {
        ctx.addIssue({ code: 'custom', message })
      }
      const ref = field.optionsFrom
      if (ref === undefined || !PLAN_REF.test(ref)) {
        fail('has no list to choose from')
      } else if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        fail('must be a list of items from the plan')
      } else if (!Array.isArray(plan?.[ref.slice('plan.'.length)])) {
        fail('has nothing to choose from on this day')
      } else if (new Set(value).size !== value.length) {
        fail('lists an item twice')
      } else {
        const list = planList(field, plan) ?? []
        if (value.some((item) => !list.includes(item))) fail('lists an item this day doesn’t have')
      }
    }),
  empty: () => [],
  summary: (value) => (value.length === 0 ? 'None' : value.join(', ')),
  Renderer: PlanChecklist,
})

type Row = { name: string | null; items: { item: string; text: string }[] }
type Group = { name: string | null; rows: Row[] }

/**
 * Items like "p. 31 #4" grouped by what comes before " #" (the page), with a problem's
 * lettered parts ("p. 17 #4(a)", "(b)", …) sharing one row. Anything else is listed as
 * it is, in one group.
 */
export function groupItems(items: readonly string[]): Group[] {
  const groups: Group[] = []
  for (const item of items) {
    const match = /^(.+?) (#\d+)(\([a-z]\))?$/.exec(item)
    const groupName = match?.[1] ?? null
    let group = groups.at(-1)
    if (!group || group.name !== groupName) {
      group = { name: groupName, rows: [] }
      groups.push(group)
    }
    const rowName = match?.[3] ? (match[2] ?? null) : null
    let row = group.rows.at(-1)
    if (!row || row.name !== rowName) {
      row = { name: rowName, items: [] }
      group.rows.push(row)
    }
    row.items.push({ item, text: match ? (match[3] ?? match[2] ?? item) : item })
  }
  return groups
}

function PlanChecklist({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  plan,
}: FieldProps<Picked>) {
  const items = planList(field, plan ?? null) ?? []
  const picked = new Set(value ?? [])
  const first = items[0]
  const toggle = (item: string, on: boolean) => {
    // Kept in the plan's order, so the stored list reads like the pages.
    onChange(items.filter((i) => (i === item ? on : picked.has(i))))
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-col gap-4"
    >
      {groupItems(items).map((group) => (
        <div key={group.name ?? ''} className="flex flex-col gap-2">
          {group.name ? (
            <p className="text-small font-medium text-muted-foreground">{group.name}</p>
          ) : null}
          {group.rows.map((row, index) => (
            <div
              key={row.name ?? `plain-${String(index)}`}
              className="flex flex-wrap items-center gap-2"
            >
              {row.name ? (
                <span className="w-10 text-body text-foreground tabular-nums">{row.name}</span>
              ) : null}
              {row.items.map(({ item, text }) => (
                <label key={item} className="relative">
                  <input
                    type="checkbox"
                    checked={picked.has(item)}
                    onChange={(e) => {
                      toggle(item, e.target.checked)
                    }}
                    aria-label={item}
                    autoFocus={autoFocus && item === first}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-input',
                      'bg-card px-3 text-body text-foreground tabular-nums select-none',
                      'transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.97]',
                      'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
                      'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
                    )}
                  >
                    {text}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      ))}
      <p aria-live="polite" className="text-small text-muted-foreground">
        {picked.size === 0 ? 'None checked.' : `${String(picked.size)} checked.`}
      </p>
    </div>
  )
}
