import { daysBetween } from '../src/lib/dates.ts'

/**
 * The nightly backup's copies in the `backups` bucket, one per night, named by the New
 * York date it was taken: `2026-11-09.tar.gz`.
 */
export const KEEP_DAYS = 30

const NAME = /^(\d{4}-\d{2}-\d{2})\.tar\.gz$/

export function backupName(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`not a date: ${day}`)
  return `${day}.tar.gz`
}

/**
 * The copies to delete: those taken `keep` or more days before today, so `keep` nights
 * are kept, today's included. Anything not named like a copy is left alone.
 */
export function expiredBackups(names: string[], today: string, keep = KEEP_DAYS): string[] {
  return names.filter((name) => {
    const day = NAME.exec(name)?.[1]
    return day !== undefined && daysBetween(day, today) >= keep
  })
}
