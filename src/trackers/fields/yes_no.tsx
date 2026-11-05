import { useEffect, useEffectEvent } from 'react'
import { z } from 'zod'
import { defineFieldType, isTyping, type FieldProps } from './contract'
import { Segmented } from './controls'

const OPTIONS = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
] as const

/** Yes or no. Blank until answered, so a required one must be chosen. Keys y and n pick. */
export default defineFieldType<boolean>({
  schema: () => z.boolean({ error: 'must be yes or no' }),
  empty: () => null,
  summary: (value) => (value ? 'Yes' : 'No'),
  Renderer: YesNo,
})

function YesNo({
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  hotkeys,
  onSubmit,
}: FieldProps<boolean>) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
    const key = event.key.toLowerCase()
    if (key === 'y' || key === 'n') {
      event.preventDefault()
      onChange(key === 'y')
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
      options={OPTIONS}
      value={value === null ? null : value ? 'yes' : 'no'}
      onChange={(key) => {
        onChange(key === 'yes')
      }}
      onKeyDown={(event) => {
        // The log flow may already have taken this Enter (it listens first).
        if (event.key === 'Enter' && onSubmit && !event.defaultPrevented) {
          event.preventDefault()
          onSubmit()
        }
      }}
      labelId={labelId}
      describedBy={describedBy}
      invalid={invalid}
      autoFocus={autoFocus}
    />
  )
}
