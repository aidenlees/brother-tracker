import { useEffectEvent, useEffect } from 'react'
import { defineFieldType, isTyping, whole, type FieldProps } from './contract'
import { Segmented } from './controls'

const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: String(n) }))

/** A whole number from 1 to 5. Keys 1–5 pick it when the field fills the screen. */
export default defineFieldType<number>({
  schema: () => whole(1, 5, 'must be a rating from 1 to 5'),
  empty: () => null,
  summary: (value) => `${value} of 5`,
  Renderer: Rating,
})

function Rating({
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  hotkeys,
}: FieldProps<number>) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
    if (/^[1-5]$/.test(event.key)) {
      event.preventDefault()
      onChange(Number(event.key))
    }
  })
  useEffect(() => {
    if (!hotkeys) return
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [hotkeys])

  return (
    <Segmented
      name={labelId}
      options={RATINGS}
      value={value === null ? null : String(value)}
      onChange={(key) => {
        onChange(Number(key))
      }}
      labelId={labelId}
      describedBy={describedBy}
      invalid={invalid}
      autoFocus={autoFocus}
    />
  )
}
