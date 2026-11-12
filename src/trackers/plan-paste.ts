/**
 * Sessions the admin adds to a plan by hand (Phase 4: "plans for any tracker"): one at a
 * time, or a list pasted from a spreadsheet, a row per session. Each becomes a plan item
 * whose details read like the math plan's (session, topic, pages, problems), so Today,
 * My week, the session page and the struggled checklist treat it the same way.
 *
 * A pasted row is `date, topic[, pages[, problems]]`, split by tabs (a spreadsheet's
 * copy) or commas:
 *   2026-12-07    Fractions    32-35    p. 32 #1; p. 33 #4
 *   12/8/2026, Fractions, 36
 */
import { PROBLEM_LABEL } from './definition'

export type NewSession = {
  date: string
  topic: string
  pageStart: number | null
  pageEnd: number | null
  problems: string[]
}

export type PastedRow = { line: number; session: NewSession | null; problem: string | null }

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/** "2026-12-07" or "12/7/2026" as an ISO date, or null when it isn't a real day. */
export function readDate(text: string): string | null {
  const t = text.trim()
  const iso = ISO.exec(t)
  const us = US.exec(t)
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [Number(us[3]), Number(us[1]), Number(us[2])]
      : [NaN, NaN, NaN]
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

/** "32-35", "32–35" or "32" as a page range; null for blank; "bad" for anything else. */
export function readPages(text: string): { start: number; end: number } | null | 'bad' {
  const t = text.trim()
  if (!t) return null
  const match = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(t)
  if (!match) return 'bad'
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  return start >= 1 && end >= start ? { start, end } : 'bad'
}

/** Problems separated by semicolons or new lines; each must read like "p. 31 #4". */
export function readProblems(text: string): { problems: string[]; bad: string[] } {
  const parts = text
    .split(/[;\n]/)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  return {
    problems: parts.filter((p) => PROBLEM_LABEL.test(p)),
    bad: parts.filter((p) => !PROBLEM_LABEL.test(p)),
  }
}

/** One session, checked: the day, a topic, and pages and problems if given. */
export function checkSession(input: {
  date: string
  topic: string
  pages: string
  problems: string
}): { session: NewSession } | { problem: string } {
  const date = readDate(input.date)
  if (!date) return { problem: 'Give a real day, like 2026-12-07 or 12/7/2026.' }
  const topic = input.topic.trim()
  if (!topic) return { problem: 'Give the session a topic.' }
  if (topic.length > 120) return { problem: 'Keep the topic under 120 characters.' }
  const pages = readPages(input.pages)
  if (pages === 'bad') return { problem: 'Pages look like 32, or 32-35.' }
  const { problems, bad } = readProblems(input.problems)
  if (bad.length > 0) {
    return { problem: `Problems look like “p. 31 #4” or “p. 15 #2(e)”: not “${bad[0] ?? ''}”.` }
  }
  return {
    session: {
      date,
      topic,
      pageStart: pages?.start ?? null,
      pageEnd: pages?.end ?? null,
      problems,
    },
  }
}

/** Every pasted row, read: a session, or the reason it can't be one. Blank lines are skipped. */
export function readPasted(text: string): PastedRow[] {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.trim() !== '')
    .map(({ raw, line }) => {
      const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map((c) => c.trim())
      const [date = '', topic = '', pages = '', ...rest] = cells
      const checked = checkSession({ date, topic, pages, problems: rest.join(';') })
      return 'session' in checked
        ? { line, session: checked.session, problem: null }
        : { line, session: null, problem: checked.problem }
    })
}

/**
 * Plan items for new sessions, numbered on after the plan's last, in date order. The
 * details carry what the rest of the app reads (session, topic, pages, problems, kind).
 */
export function toPlanItems(
  assignmentId: string,
  sessions: readonly NewSession[],
  existing: readonly { details: Readonly<Record<string, unknown>>; sort: number }[],
) {
  const lastSession = Math.max(
    0,
    ...existing.map((i) => (typeof i.details.session === 'number' ? i.details.session : 0)),
  )
  const lastSort = Math.max(0, ...existing.map((i) => i.sort))
  return [...sessions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s, i) => ({
      assignment_id: assignmentId,
      date: s.date,
      title: s.topic,
      sort: lastSort + i + 1,
      details: {
        session: lastSession + i + 1,
        topic: s.topic,
        kind: 'practice',
        reading_only: false,
        ...(s.pageStart !== null ? { page_start: s.pageStart, page_end: s.pageEnd } : {}),
        ...(s.problems.length > 0 ? { problems: s.problems } : {}),
      },
    }))
}
