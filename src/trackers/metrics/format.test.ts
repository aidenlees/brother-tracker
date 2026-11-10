import { describe, expect, it } from 'vitest'
import type { FieldDefinition } from '../definition'
import { readMetric, type Metric } from './engine'
import { formatMetric } from './format'

const fields: FieldDefinition[] = [
  { key: 'minutes', type: 'duration', label: 'Minutes', required: true },
]
const read = (definition: Parameters<typeof readMetric>[0]): Metric => {
  const metric = readMetric(definition)
  if (!metric) throw new Error('unread')
  return metric
}

describe('a metric in words', () => {
  it('writes a share as a whole percent', () => {
    const rate = read({
      key: 'r',
      type: 'ratio',
      label: 'Solved on my own',
      numerator: 'count(a)',
      denominator: 'count(b)',
      format: 'percent',
    })
    expect(formatMetric(rate, 12 / 18, fields)).toBe('67%')
  })

  it('writes minutes like the minutes field, and an average to one decimal', () => {
    const sum = read({ key: 's', type: 'sum', label: 'Minutes', field: 'minutes' })
    const avg = read({ key: 'a', type: 'avg', label: 'Minutes', field: 'minutes' })
    expect(formatMetric(sum, 110, fields)).toBe('110 min')
    expect(formatMetric(avg, 22.46, fields)).toBe('22.5 min')
  })

  it('writes counts, days and streaks plainly', () => {
    const count = read({ key: 'c', type: 'count_where', label: 'Done', where: 'done' })
    const days = read({ key: 'd', type: 'days_per_week', label: 'Days', where: 'done' })
    const streak = read({ key: 'k', type: 'streak', label: 'Streak', where: 'done' })
    expect(formatMetric(count, 3, fields)).toBe('3')
    expect(formatMetric(days, 1, fields)).toBe('1 day')
    expect(formatMetric(days, 5, fields)).toBe('5 days')
    expect(formatMetric(streak, 4, fields)).toBe('4 days in a row')
    expect(formatMetric(streak, 0, fields)).toBe('None')
  })
})
