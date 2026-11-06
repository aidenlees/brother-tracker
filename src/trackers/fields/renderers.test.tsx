import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldDefinition, FieldTypeName } from '../definition'
import { FIELD_REGISTRY } from './registry'

/** Renders one field with its own state, as the log step will. */
function Harness({
  field,
  initial,
  hotkeys,
  onSubmit,
  onValue,
}: {
  field: FieldDefinition
  initial: unknown
  hotkeys?: boolean
  onSubmit?: () => void
  onValue?: (value: unknown) => void
}) {
  const [value, setValue] = useState<unknown>(initial)
  const { Renderer } = FIELD_REGISTRY[field.type]
  return (
    <>
      <span id="label">{field.label}</span>
      <Renderer
        field={field}
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue?.(next)
        }}
        labelId="label"
        hotkeys={hotkeys}
        onSubmit={onSubmit}
      />
      <input aria-label="elsewhere" />
    </>
  )
}

const field = (type: FieldTypeName, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  key: 'value',
  type,
  label: 'Value',
  required: false,
  ...extra,
})

const outcomes = field('tally_group', {
  options: [
    { key: 'I', label: 'Solved on my own', shortcut: 'i' },
    { key: 'H', label: 'Solved after a hint', shortcut: 'h' },
  ],
})

describe('tally_group', () => {
  it('adds with the shortcut keys, takes back the last tap with Backspace', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={outcomes} initial={{ I: 0, H: 0 }} hotkeys onValue={onValue} />)
    await user.keyboard('iih')
    expect(onValue).toHaveBeenLastCalledWith({ I: 2, H: 1 })
    await user.keyboard('{Backspace}')
    expect(onValue).toHaveBeenLastCalledWith({ I: 2, H: 0 })
    await user.keyboard('{Shift>}i{/Shift}')
    expect(onValue).toHaveBeenLastCalledWith({ I: 1, H: 0 })
    expect(screen.getByText('1 problem')).toBeInTheDocument()
  })

  it('leaves the keys alone while typing in a text box', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={outcomes} initial={{ I: 0, H: 0 }} hotkeys onValue={onValue} />)
    await user.type(screen.getByLabelText('elsewhere'), 'hi')
    expect(onValue).not.toHaveBeenCalled()
  })

  it('lowers a count it didn’t add this visit with the − button', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={outcomes} initial={{ I: 3, H: 0 }} onValue={onValue} />)
    await user.click(screen.getByRole('button', { name: 'Solved on my own: remove one' }))
    expect(onValue).toHaveBeenLastCalledWith({ I: 2, H: 0 })
    expect(screen.getByRole('button', { name: 'Solved after a hint: remove one' })).toBeDisabled()
  })
})

describe('long_text', () => {
  it('moves on with Enter and starts a new line with Shift+Enter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onValue = vi.fn()
    render(<Harness field={field('long_text')} initial="" onSubmit={onSubmit} onValue={onValue} />)
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'one{Shift>}{Enter}{/Shift}two')
    expect(onValue).toHaveBeenLastCalledWith('one\ntwo')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onValue).toHaveBeenLastCalledWith('one\ntwo')
  })
})

describe('yes_no', () => {
  it('answers with y and n when it fills the screen', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={field('yes_no')} initial={null} hotkeys onValue={onValue} />)
    await user.keyboard('y')
    expect(onValue).toHaveBeenLastCalledWith(true)
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeChecked()
    await user.keyboard('n')
    expect(onValue).toHaveBeenLastCalledWith(false)
  })
})

describe('number boxes', () => {
  it('duration keeps only digits', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={field('duration')} initial={null} onValue={onValue} />)
    await user.type(screen.getByRole('textbox', { name: 'Value' }), '4a5')
    expect(onValue).toHaveBeenLastCalledWith(45)
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('45')
  })

  it('number passes NaN for text that isn’t a number, so validation can say so', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness field={field('number')} initial={null} onValue={onValue} />)
    const box = screen.getByRole('textbox', { name: 'Value' })
    await user.type(box, '-')
    expect(onValue).toHaveBeenLastCalledWith(Number.NaN)
    await user.type(box, '2.5')
    expect(onValue).toHaveBeenLastCalledWith(-2.5)
    await user.clear(box)
    expect(onValue).toHaveBeenLastCalledWith(null)
  })
})

describe('summaries', () => {
  it('read plainly', () => {
    const { summary } = FIELD_REGISTRY.tally_group
    expect(summary({ I: 5, H: 2 }, outcomes)).toBe('I 5 · H 2')
    expect(FIELD_REGISTRY.duration.summary(45, field('duration'))).toBe('45 min')
    expect(FIELD_REGISTRY.page_range.summary({ start: 31, end: 32 }, field('page_range'))).toBe(
      'pp. 31–32',
    )
    expect(FIELD_REGISTRY.page_range.summary({ start: 35, end: 35 }, field('page_range'))).toBe(
      'p. 35',
    )
    const checklist = field('checklist', {
      options: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    expect(FIELD_REGISTRY.checklist.summary({ a: true, b: false }, checklist)).toBe('1 of 2')
  })
})
