/**
 * The two small rule languages a tracker's metrics are written in (seed/trackers.json),
 * read here so a tracker built later gets its numbers with no new code:
 *
 *   where  a field that must be true, or several joined by "or" ("completed or read")
 *   count  a sum of counts and whole numbers ("count(plan.problems) - count(struggled)"):
 *          count(x) is how many items the list x holds, from the entry's answers, or from
 *          its plan item with "plan."
 *
 * Anything else is refused (null), so a typo shows as a blank number, never a wrong one;
 * a test reads every seeded rule.
 */
import type { PlanDetails } from '../definition'

type Answers = Readonly<Record<string, unknown>>

const NAME = '[A-Za-z][A-Za-z0-9_]*'
const WHERE = new RegExp(`^${NAME}( or ${NAME})*$`)

/** A where rule as a test on an entry's answers, or null when it isn't one. */
export function whereRule(where: unknown): ((data: Answers) => boolean) | null {
  if (typeof where !== 'string' || !WHERE.test(where.trim())) return null
  const fields = where.trim().split(' or ')
  return (data) => fields.some((field) => data[field] === true)
}

type Term = { sign: 1 | -1 } & ({ count: string; plan: boolean } | { number: number })

const TERM = new RegExp(`^(?:count\\((plan\\.)?(${NAME})\\)|(\\d+))$`)

/** A count rule as a function of an entry, or null when it isn't one. */
export function countRule(rule: unknown): ((data: Answers, plan: PlanDetails) => number) | null {
  if (typeof rule !== 'string') return null
  const parts = rule.trim().split(/\s*([+-])\s*/)
  const terms: Term[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const sign = i === 0 || parts[i - 1] === '+' ? 1 : -1
    const match = TERM.exec(parts[i] ?? '')
    if (!match) return null
    const [, plan, name, number] = match
    terms.push(
      name !== undefined
        ? { sign, count: name, plan: plan !== undefined }
        : { sign, number: Number(number) },
    )
  }
  const size = (value: unknown) => (Array.isArray(value) ? value.length : 0)
  return (data, plan) =>
    terms.reduce(
      (total, term) =>
        total +
        term.sign *
          ('number' in term ? term.number : size((term.plan ? plan : data)?.[term.count])),
      0,
    )
}
