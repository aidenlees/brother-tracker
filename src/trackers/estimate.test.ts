import { describe, expect, it } from 'vitest'
import {
  MINUTES,
  minutesLabel,
  pageMinutes,
  problemsMinutes,
  rangeMinutes,
  sessionMinutes,
} from './estimate'

// A worked-example page (30), a page of two problems (31), a page with one (32), and a
// problem whose parts run from 33 onto 34.
const index = new Map<number, string[]>([
  [31, ['p. 31 #3', 'p. 31 #4']],
  [32, ['p. 32 #5']],
  [33, ['p. 33 #6(a)', 'p. 33 #6(b)']],
  [34, ['p. 34 #6(c)']],
])

describe('the work estimate', () => {
  it('reads a page with no problems as examples to read', () => {
    expect(pageMinutes(index, 30)).toBe(MINUTES.readingPage)
  })

  it('gives a problem alone on its page more time than two sharing one', () => {
    expect(pageMinutes(index, 32)).toBe(MINUTES.soloProblem)
    expect(pageMinutes(index, 31)).toBe(2 * MINUTES.sharedProblem)
  })

  it('times lettered parts one by one, plus reading the question on each page', () => {
    expect(pageMinutes(index, 33)).toBe(MINUTES.stem + 2 * MINUTES.part)
    expect(pageMinutes(index, 34)).toBe(MINUTES.stem + MINUTES.part)
  })

  it('adds up a range of pages', () => {
    expect(rangeMinutes(index, 30, 32)).toBe(4 + 10 + 9)
  })

  it('times named problems as the book prints them, a whole problem with all its parts', () => {
    expect(problemsMinutes(index, ['p. 32 #5', 'p. 31 #3'])).toBe(9 + 5)
    expect(problemsMinutes(index, ['p. 33 #6(b)'])).toBe(MINUTES.stem + MINUTES.part)
    expect(problemsMinutes(index, ['p. 33 #6'])).toBe(MINUTES.stem + 2 * MINUTES.part)
  })

  it('uses a session’s pages, else the problems it names, else nothing', () => {
    expect(sessionMinutes(index, { page_start: 31, page_end: 32 })).toBe(19)
    expect(sessionMinutes(index, { page_start: null, problems: ['p. 32 #5'] })).toBe(9)
    expect(sessionMinutes(index, {})).toBeNull()
  })

  it('says it in round numbers', () => {
    expect(minutesLabel(44)).toBe('About 45 min')
    expect(minutesLabel(51.5)).toBe('About 50 min')
    expect(minutesLabel(1)).toBe('About 5 min')
  })
})
