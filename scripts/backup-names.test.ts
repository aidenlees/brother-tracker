// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { backupName, expiredBackups, KEEP_DAYS } from './backup-names.ts'

describe('backup names', () => {
  it('names a copy by its day', () => {
    expect(backupName('2026-11-09')).toBe('2026-11-09.tar.gz')
    expect(() => backupName('11/09/2026')).toThrow()
  })

  it('keeps 30 nights, today included, and deletes the older ones', () => {
    expect(KEEP_DAYS).toBe(30)
    const today = '2026-12-10'
    const names = [
      '2026-12-10.tar.gz', // today
      '2026-11-11.tar.gz', // 29 days back: the oldest kept
      '2026-11-10.tar.gz', // 30 days back
      '2026-10-01.tar.gz',
    ]
    expect(expiredBackups(names, today)).toEqual(['2026-11-10.tar.gz', '2026-10-01.tar.gz'])
  })

  it('never deletes a file it didn’t name', () => {
    expect(
      expiredBackups(['notes.txt', '2020-01-01.sql', 'old/2020-01-01.tar.gz'], '2026-12-10'),
    ).toEqual([])
  })
})
