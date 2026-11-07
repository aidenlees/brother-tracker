import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { FieldDefinition, PlanDetails } from '../definition'
import { cleanEntry, shownFields } from '../entry'
import { groupItems } from './plan_checklist'
import { FIELD_REGISTRY } from './registry'

const struggled: FieldDefinition = {
  key: 'struggled',
  type: 'plan_checklist',
  label: 'Which problems did you struggle with?',
  required: false,
  optionsFrom: 'plan.problems',
}
const minutes: FieldDefinition = {
  key: 'minutes',
  type: 'duration',
  label: 'Minutes',
  required: true,
}
const PLAN: PlanDetails = { problems: ['p. 31 #3', 'p. 31 #4', 'p. 32 #5(a)', 'p. 32 #5(b)'] }

describe('groupItems', () => {
  it('groups by page and puts a problem’s lettered parts on one row', () => {
    expect(groupItems(['p. 31 #3', 'p. 31 #4', 'p. 32 #5(a)', 'p. 32 #5(b)', 'p. 32 #6'])).toEqual([
      {
        name: 'p. 31',
        rows: [
          {
            name: null,
            items: [
              { item: 'p. 31 #3', text: '#3' },
              { item: 'p. 31 #4', text: '#4' },
            ],
          },
        ],
      },
      {
        name: 'p. 32',
        rows: [
          {
            name: '#5',
            items: [
              { item: 'p. 32 #5(a)', text: '(a)' },
              { item: 'p. 32 #5(b)', text: '(b)' },
            ],
          },
          { name: null, items: [{ item: 'p. 32 #6', text: '#6' }] },
        ],
      },
    ])
  })

  it('lists items of any other shape as they are', () => {
    expect(groupItems(['Scales in G', 'Minuet 2'])).toEqual([
      {
        name: null,
        rows: [
          {
            name: null,
            items: [
              { item: 'Scales in G', text: 'Scales in G' },
              { item: 'Minuet 2', text: 'Minuet 2' },
            ],
          },
        ],
      },
    ])
  })
})

describe('a plan_checklist in an entry', () => {
  it('shows only on a plan item with a list, as entries_validate does', () => {
    expect(shownFields([struggled, minutes], {}, PLAN)).toEqual([struggled, minutes])
    expect(shownFields([struggled, minutes], {}, { kind: 'review' })).toEqual([minutes])
    expect(shownFields([struggled, minutes], {}, { problems: [] })).toEqual([minutes])
    expect(shownFields([struggled, minutes], {}, null)).toEqual([minutes])
  })

  it('keeps that session’s problems, and drops the value on a day without a list', () => {
    expect(
      cleanEntry([struggled, minutes], { struggled: ['p. 31 #4'], minutes: 30 }, PLAN),
    ).toEqual({
      ok: true,
      data: { struggled: ['p. 31 #4'], minutes: 30 },
    })
    expect(
      cleanEntry(
        [struggled, minutes],
        { struggled: ['p. 31 #4'], minutes: 30 },
        { kind: 'review' },
      ),
    ).toEqual({ ok: true, data: { minutes: 30 } })
  })

  it('refuses a problem from another session, in the SQL check’s words', () => {
    expect(cleanEntry([struggled], { struggled: ['p. 33 #7'] }, PLAN)).toEqual({
      ok: false,
      issues: [
        {
          key: 'struggled',
          message: 'Which problems did you struggle with? lists an item this day doesn’t have',
        },
      ],
    })
  })
})

function Harness({ onValue }: { onValue: (value: unknown) => void }) {
  const [value, setValue] = useState<unknown>([])
  const { Renderer } = FIELD_REGISTRY.plan_checklist
  return (
    <>
      <span id="label">{struggled.label}</span>
      <Renderer
        field={struggled}
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue(next)
        }}
        labelId="label"
        plan={PLAN}
        autoFocus
      />
    </>
  )
}

describe('plan_checklist renderer', () => {
  it('names each box by its problem, and keeps the plan’s order whatever the clicks', async () => {
    const user = userEvent.setup()
    const values: unknown[] = []
    render(<Harness onValue={(v) => values.push(v)} />)

    expect(screen.getByRole('group', { name: struggled.label })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'p. 31 #3' })).toHaveFocus()
    expect(screen.getByText('None checked.')).toBeInTheDocument()

    await user.keyboard(' ') // the first box has the focus
    expect(values.at(-1)).toEqual(['p. 31 #3'])
    await user.click(screen.getByText('(b)'))
    await user.click(screen.getByText('#4'))
    expect(values.at(-1)).toEqual(['p. 31 #3', 'p. 31 #4', 'p. 32 #5(b)'])
    expect(screen.getByRole('checkbox', { name: 'p. 32 #5(b)' })).toBeChecked()
    expect(screen.getByText('3 checked.')).toBeInTheDocument()

    await user.click(screen.getByText('#3'))
    expect(values.at(-1)).toEqual(['p. 31 #4', 'p. 32 #5(b)'])
  })
})
