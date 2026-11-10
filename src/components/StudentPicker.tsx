import { useId } from 'react'
import type { Student } from '@/lib/admin-logs'

/** Which student a screen shows: a menu when there's more than one, else their name. */
export function StudentPicker({
  students,
  value,
  onChange,
}: {
  students: readonly Student[]
  value: Student
  onChange: (id: string) => void
}) {
  const id = useId()
  if (students.length <= 1) return <p className="text-body text-foreground">{value.name}</p>
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-small text-muted-foreground">
      Student
      <select
        id={id}
        value={value.id}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className="h-11 max-w-sm rounded-md border border-input bg-card px-3 text-body text-foreground"
      >
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}
