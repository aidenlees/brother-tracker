import { describe, expect, it } from 'vitest'
import { CACHE_MAX_AGE, queryClient } from './query'

/** The longest delay setTimeout honours; anything longer fires at once. */
const MAX_TIMEOUT = 2 ** 31 - 1

describe('the query cache', () => {
  it('never schedules a garbage-collection timer setTimeout can’t hold', () => {
    const gcTime = queryClient.getDefaultOptions().queries?.gcTime
    // Infinity disables collection; any finite value must fit a timer.
    expect(gcTime === Infinity || (typeof gcTime === 'number' && gcTime <= MAX_TIMEOUT)).toBe(true)
  })

  it('keeps the copy on the device for 30 days', () => {
    expect(CACHE_MAX_AGE).toBe(30 * 24 * 60 * 60 * 1000)
  })
})
