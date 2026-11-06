import { Minus, Undo2 } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { defineFieldType, isRecord, isTyping, optionKeys, type FieldProps } from './contract'

export type Tally = Record<string, number>

/**
 * A count per option, one tap (or shortcut key) per problem. When the field fills the
 * screen, each option's shortcut adds one, Shift+shortcut removes one, and Backspace
 * takes back the last tap. The − beside a count fixes a resumed or edited entry, whose
 * earlier taps aren't in this visit's undo history.
 */
export default defineFieldType<Tally>({
  schema: (field) => {
    const keys = optionKeys(field)
    return z
      .custom<Tally>(isRecord, { message: 'must be a set of counts' })
      .superRefine((v, ctx) => {
        for (const [key, count] of Object.entries(v)) {
          if (!keys.includes(key)) {
            ctx.addIssue({ code: 'custom', message: `has no option "${key}"` })
            return
          }
          if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
            ctx.addIssue({ code: 'custom', message: 'counts must be whole numbers, 0 or more' })
            return
          }
        }
      })
  },
  empty: (field) => Object.fromEntries(optionKeys(field).map((key) => [key, 0])),
  summary: (value, field) =>
    optionKeys(field)
      .map((key) => `${key} ${value[key] ?? 0}`)
      .join(' · '),
  Renderer: TallyGroup,
})

function TallyGroup({
  field,
  value,
  onChange,
  labelId,
  describedBy,
  autoFocus,
  hotkeys,
}: FieldProps<Tally>) {
  const options = field.options ?? []
  const counts = value ?? {}
  // Taps this visit, newest last, so Backspace can take back the latest one.
  const [taps, setTaps] = useState<string[]>([])
  const [pressed, setPressed] = useState<string | null>(null)
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (autoFocus) first.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (pressed === null) return
    const timer = window.setTimeout(() => {
      setPressed(null)
    }, 140)
    return () => {
      window.clearTimeout(timer)
    }
  }, [pressed])

  const add = (key: string) => {
    onChange({ ...counts, [key]: (counts[key] ?? 0) + 1 })
    setTaps((t) => [...t, key])
    setPressed(key)
  }

  const remove = (key: string) => {
    if ((counts[key] ?? 0) === 0) return
    onChange({ ...counts, [key]: (counts[key] ?? 0) - 1 })
    // Forget this visit's latest tap of that option, if any, so Undo stays truthful.
    setTaps((t) => {
      const at = t.lastIndexOf(key)
      return at === -1 ? t : [...t.slice(0, at), ...t.slice(at + 1)]
    })
  }

  const undo = () => {
    const last = taps.at(-1)
    if (last !== undefined) remove(last)
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
    if (event.key === 'Backspace') {
      event.preventDefault()
      undo()
      return
    }
    const option = options.find((o) => o.shortcut?.toLowerCase() === event.key.toLowerCase())
    if (option) {
      event.preventDefault()
      if (event.shiftKey) remove(option.key)
      else add(option.key)
    }
  })

  useEffect(() => {
    if (!hotkeys) return
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [hotkeys])

  const total = options.reduce((sum, o) => sum + (counts[o.key] ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {options.map((option, index) => {
          const count = counts[option.key] ?? 0
          return (
            <div key={option.key} className="flex items-stretch gap-1">
              <button
                ref={index === 0 ? first : undefined}
                type="button"
                onClick={() => {
                  add(option.key)
                }}
                aria-label={`${option.label}: ${count}. Add one`}
                aria-keyshortcuts={option.shortcut}
                data-pressed={pressed === option.key || undefined}
                className={cn(
                  'flex min-h-16 flex-1 items-center gap-4 rounded-lg border border-input bg-card px-4 py-3',
                  'text-left transition-[transform,background-color] duration-150 select-none hover:bg-muted',
                  'active:scale-[0.97] data-pressed:scale-[0.97] data-pressed:bg-muted',
                )}
              >
                <span className="min-w-10 text-3xl font-medium tabular-nums">{count}</span>
                <span className="flex flex-col">
                  <span className="text-base text-foreground">{option.label}</span>
                  {option.shortcut ? (
                    <kbd className="font-sans text-sm text-muted-foreground">
                      {option.key} · key {option.shortcut}
                    </kbd>
                  ) : null}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-auto w-10 text-muted-foreground"
                onClick={() => {
                  remove(option.key)
                }}
                disabled={count === 0}
                aria-label={`${option.label}: remove one`}
              >
                <Minus aria-hidden />
              </Button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground tabular-nums" aria-live="polite">
          {total === 1 ? '1 problem' : `${total} problems`}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={taps.length === 0}
          aria-keyshortcuts={hotkeys ? 'Backspace' : undefined}
        >
          <Undo2 aria-hidden />
          Undo last
        </Button>
      </div>
    </div>
  )
}
