import { describe, expect, it } from 'vitest'
import {
  checkSession,
  readDate,
  readPages,
  readPasted,
  readProblems,
  toPlanItems,
} from './plan-paste'

describe('adding sessions to a plan', () => {
  it('reads days written either way, and only real ones', () => {
    expect(readDate('2026-12-07')).toBe('2026-12-07')
    expect(readDate(' 12/7/2026 ')).toBe('2026-12-07')
    expect(readDate('2027-02-29')).toBeNull()
    expect(readDate('next Monday')).toBeNull()
  })

  it('reads a page, a range, or nothing', () => {
    expect(readPages('32-35')).toEqual({ start: 32, end: 35 })
    expect(readPages('32 – 35')).toEqual({ start: 32, end: 35 })
    expect(readPages('40')).toEqual({ start: 40, end: 40 })
    expect(readPages('')).toBeNull()
    expect(readPages('35-32')).toBe('bad')
    expect(readPages('ch. 3')).toBe('bad')
  })

  it('reads problems named like the book’s, and points at one that isn’t', () => {
    expect(readProblems('p. 31 #4; p. 15 #2(e)\n  p.  32  #6')).toEqual({
      problems: ['p. 31 #4', 'p. 15 #2(e)', 'p. 32 #6'],
      bad: [],
    })
    expect(readProblems('p. 31 #4; question 5').bad).toEqual(['question 5'])
  })

  it('checks one session, saying what to fix', () => {
    expect(
      checkSession({ date: '12/7/2026', topic: ' Fractions ', pages: '32-35', problems: '' }),
    ).toEqual({
      session: { date: '2026-12-07', topic: 'Fractions', pageStart: 32, pageEnd: 35, problems: [] },
    })
    expect(checkSession({ date: 'soon', topic: 'x', pages: '', problems: '' })).toEqual({
      problem: 'Give a real day, like 2026-12-07 or 12/7/2026.',
    })
    expect(checkSession({ date: '2026-12-07', topic: '', pages: '', problems: '' })).toEqual({
      problem: 'Give the session a topic.',
    })
  })

  it('reads a list pasted from a spreadsheet (tabs) or typed (commas)', () => {
    const rows = readPasted(
      [
        '2026-12-07\tFractions\t32-35\tp. 32 #1; p. 33 #4',
        '',
        '12/8/2026, Decimals, 36',
        'Tuesday, Oops',
      ].join('\n'),
    )
    expect(rows.map((r) => [r.line, r.session?.topic ?? null, r.problem])).toEqual([
      [1, 'Fractions', null],
      [3, 'Decimals', null],
      [4, null, 'Give a real day, like 2026-12-07 or 12/7/2026.'],
    ])
    expect(rows[0]?.session?.problems).toEqual(['p. 32 #1', 'p. 33 #4'])
  })

  it('numbers new sessions on from the plan’s last, in date order', () => {
    const items = toPlanItems(
      'a1',
      [
        { date: '2026-12-08', topic: 'Decimals', pageStart: 36, pageEnd: 36, problems: [] },
        {
          date: '2026-12-07',
          topic: 'Fractions',
          pageStart: null,
          pageEnd: null,
          problems: ['p. 32 #1'],
        },
      ],
      [{ details: { session: 54 }, sort: 54 }],
    )
    expect(items).toEqual([
      {
        assignment_id: 'a1',
        date: '2026-12-07',
        title: 'Fractions',
        sort: 55,
        details: {
          session: 55,
          topic: 'Fractions',
          kind: 'practice',
          reading_only: false,
          problems: ['p. 32 #1'],
        },
      },
      {
        assignment_id: 'a1',
        date: '2026-12-08',
        title: 'Decimals',
        sort: 56,
        details: {
          session: 56,
          topic: 'Decimals',
          kind: 'practice',
          reading_only: false,
          page_start: 36,
          page_end: 36,
        },
      },
    ])
    expect(toPlanItems('a1', [], [])).toEqual([])
  })
})
