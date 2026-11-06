/** All "today" logic runs in this zone (CLAUDE.md, "Dates"). */
export const APP_TIME_ZONE = 'America/New_York'

/** The calendar date (YYYY-MM-DD) in `timeZone` at the instant `now`. */
export function localDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((p) => p.type === type)?.value
    if (!value) throw new Error(`Could not format ${type} for ${timeZone}`)
    return value
  }
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** "Thursday, November 5" for the instant `now`, in New York. */
export function longDateInNewYork(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)
}

/** Today's date in New York. Never derive "today" from a UTC timestamp. */
export function todayInNewYork(now: Date = new Date()): string {
  return localDateIn(APP_TIME_ZONE, now)
}

// Calendar dates (YYYY-MM-DD, no time zone) -----------------------------------------

/** A calendar date as midnight UTC, so arithmetic never crosses a daylight-saving change. */
function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function addDays(iso: string, days: number): string {
  const date = utc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000)
}

/** "Tue, Nov 10" (short) or "Tuesday, November 10" (long). */
export function formatDay(iso: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: style,
    month: style,
    day: 'numeric',
  }).format(utc(iso))
}
