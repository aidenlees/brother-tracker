import { Download } from 'lucide-react'
import { useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyNote, Page } from '@/components/Page'
import { sheet } from '@/components/sheet'
import { StudentPicker } from '@/components/StudentPicker'
import { Button } from '@/components/ui/button'
import { useStudents, type Student } from '@/lib/admin-logs'
import { toCsv, toXlsx, type Table } from '@/lib/export/files'
import { commentsTable, fileName, retriesTable, trackerTable } from '@/lib/export/tables'
import { download, useExportData } from '@/lib/export/use-export'
import { useToday } from '@/lib/use-today'

const TITLE = 'Export'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Export (admin): everything a student has logged, as a file to keep (CLAUDE.md,
 * "Everything exports"). One Excel workbook with a sheet per tracker plus every retry and
 * comment, or any one of those as CSV. Made in the browser from what the admin can read.
 */
export function ExportPage() {
  const students = useStudents()
  const [search] = useSearchParams()
  const [chosen, setChosen] = useState<string | null>(search.get('student'))

  if (students.status === 'pending') {
    return (
      <Page title={TITLE}>
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </Page>
    )
  }
  if (students.status === 'error') {
    return (
      <Page title={TITLE}>
        <EmptyNote>Couldn’t load the students. Check your connection, then reload.</EmptyNote>
      </Page>
    )
  }
  const list = students.data
  const student = list.find((s) => s.id === chosen) ?? list[0]
  if (!student) {
    return (
      <Page title={TITLE}>
        <EmptyNote>
          No student has a tracker yet. Their logs can be exported once they do.
        </EmptyNote>
      </Page>
    )
  }
  return (
    <Page title={TITLE} lead="Everything a student has logged, as a file to keep.">
      <StudentPicker students={list} value={student} onChange={setChosen} />
      <Files key={student.id} student={student} />
    </Page>
  )
}

function Files({ student }: { student: Student }) {
  const data = useExportData(student.id)
  const today = useToday()
  const headingId = useId()

  if (data.status === 'pending') {
    return (
      <p role="status" className="text-muted-foreground">
        Gathering {student.name}’s logs…
      </p>
    )
  }
  if (data.status === 'error') {
    return (
      <EmptyNote>
        Couldn’t load {student.name}’s logs. Check your connection, then reload.
      </EmptyNote>
    )
  }
  if (data.data.length === 0) {
    return (
      <EmptyNote>
        {student.name} hasn’t logged anything yet, so there’s nothing to export.
      </EmptyNote>
    )
  }

  const tables: Table[] = [
    ...data.data.map(trackerTable),
    retriesTable(data.data),
    commentsTable(data.data),
  ]
  const count = (table: Table, index: number) => {
    const n = table.rows.length
    if (index < data.data.length) return `${String(n)} ${n === 1 ? 'log' : 'logs'}`
    return String(n)
  }

  return (
    <section aria-labelledby={headingId} className={sheet()}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="font-heading text-title text-foreground">
          {student.name}’s logs
        </h2>
        <p className="text-small text-muted-foreground">
          Times are New York time. The workbook has a sheet for each table below.
        </p>
      </div>
      <div>
        <Button
          type="button"
          onClick={() => {
            download(fileName([student.name, 'practice', today], 'xlsx'), toXlsx(tables), XLSX_TYPE)
          }}
        >
          <Download aria-hidden />
          Download the workbook (.xlsx)
        </Button>
      </div>
      <ul aria-label="Tables" className="flex flex-col border-t border-border">
        {tables.map((table, index) => (
          <li
            key={table.name}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-3"
          >
            <span className="text-foreground">
              {table.name}{' '}
              <span className="text-small text-muted-foreground tabular-nums">
                · {count(table, index)}
              </span>
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              disabled={table.rows.length === 0}
              onClick={() => {
                download(
                  fileName([student.name, table.name, today], 'csv'),
                  toCsv(table),
                  'text/csv;charset=utf-8',
                )
              }}
            >
              CSV<span className="sr-only"> of {table.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
