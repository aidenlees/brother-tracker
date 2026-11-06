/**
 * Building blocks shared by the field renderers, so every type looks and behaves the
 * same: whole-row hit targets, visible focus, and Enter to move on.
 */
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { isSubmitKey } from './contract'

/** A checkbox or radio as a full-width row: the whole row is the hit target. */
export function ChoiceRow({
  type,
  name,
  checked,
  onToggle,
  label,
  hint,
  autoFocus,
  describedBy,
}: {
  type: 'checkbox' | 'radio'
  name: string
  checked: boolean
  onToggle: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  autoFocus?: boolean
  describedBy?: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-4 py-2.5',
        'text-body text-foreground transition-colors hover:bg-muted',
        'has-[:checked]:border-foreground has-[:focus-visible]:outline-2',
        'has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(e) => {
          onToggle(e.target.checked)
        }}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        className="size-5 shrink-0 accent-foreground focus-visible:outline-none"
      />
      <span>{label}</span>
      {hint ? <span className="ml-auto text-small text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export type SegmentOption = { key: string; label: string }

/** Side-by-side radios (Yes/No, 1–5). Arrow keys move between them, as native radios do. */
export function Segmented({
  name,
  options,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  onKeyDown,
}: {
  name: string
  options: readonly SegmentOption[]
  value: string | null
  onChange: (key: string) => void
  labelId: string
  describedBy?: string
  invalid?: boolean
  autoFocus?: boolean
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  const focusKey = value ?? options[0]?.key
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => (
        <label key={option.key} className="relative">
          <input
            type="radio"
            name={name}
            value={option.key}
            checked={value === option.key}
            onChange={() => {
              onChange(option.key)
            }}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus && option.key === focusKey}
            className="peer sr-only"
          />
          <span
            className={cn(
              'flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-md border border-input',
              'bg-card px-5 text-body font-medium text-foreground transition-[transform,background-color]',
              'duration-150 select-none hover:bg-muted active:scale-[0.97]',
              'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  )
}

/**
 * A text box for whole numbers. It keeps what was typed while the value is unusable
 * (empty -> null), and passes NaN for anything else so validation can say why.
 */
export function NumberBox({
  value,
  onChange,
  decimals = false,
  suffix,
  labelId,
  describedBy,
  invalid,
  autoFocus,
  onSubmit,
  placeholder,
  className,
}: {
  value: number | null
  onChange: (next: number | null) => void
  decimals?: boolean
  suffix?: string
  labelId: string
  describedBy?: string
  invalid?: boolean
  autoFocus?: boolean
  onSubmit?: () => void
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value === null || Number.isNaN(value) ? '' : String(value))
  return (
    <div className="flex items-center gap-3">
      <Input
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const next = decimals ? e.target.value : e.target.value.replace(/[^\d]/g, '')
          setText(next)
          onChange(next.trim() === '' ? null : Number(next))
        }}
        onKeyDown={(e) => {
          if (isSubmitKey(e)) {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn('w-28 text-lead tabular-nums', className)}
      />
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </div>
  )
}
