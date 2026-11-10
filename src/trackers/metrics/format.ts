/**
 * A metric's value in words for Overview: "4", "180 min", "85%", "5 days", "4 days in a
 * row" or "None". Sums and averages of a field read like its answers ("min" for minutes).
 */
import type { FieldDefinition } from '../definition'
import { FIELD_REGISTRY } from '../fields/registry'
import type { Metric } from './engine'

const days = (n: number) => `${String(n)} ${n === 1 ? 'day' : 'days'}`

export function formatMetric(
  metric: Metric,
  value: number,
  fields: readonly FieldDefinition[],
): string {
  switch (metric.type) {
    case 'ratio':
      return metric.percent ? `${String(Math.round(value * 100))}%` : value.toFixed(2)
    case 'sum':
    case 'avg': {
      const shown = metric.type === 'avg' ? Math.round(value * 10) / 10 : value
      const field = fields.find((f) => f.key === metric.field)
      return field ? FIELD_REGISTRY[field.type].summary(shown, field) : String(shown)
    }
    case 'count_where':
      return String(value)
    case 'days_per_week':
      return days(value)
    case 'streak':
      // No run going now: "None", not "0 days in a row".
      return value === 0 ? 'None' : `${days(value)} in a row`
  }
}
