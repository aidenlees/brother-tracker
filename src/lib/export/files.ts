/**
 * Files the Export screen hands over: CSV (one table) and Excel (.xlsx, one sheet per
 * table). Both are written here, in the browser, from rows the admin can already read
 * (RLS decides), so nothing leaves the device but the download itself.
 *
 * The .xlsx is the smallest valid SpreadsheetML package (Office Open XML): a workbook,
 * one worksheet per table with inline strings, a bold header row frozen at the top,
 * and column widths from the content. fflate zips it.
 */
import { strToU8, zipSync } from 'fflate'

/** A cell: text, a whole or decimal number, or empty. */
export type Cell = string | number | null

export type Table = { name: string; header: string[]; rows: Cell[][] }

/**
 * A cell as CSV text. Text that a spreadsheet would read as a formula (=, +, -, @, or a
 * tab/return first) gets a leading apostrophe, so a student's note can never run as one
 * when the file is opened (OWASP, "CSV injection").
 */
export function csvCell(cell: Cell): string {
  if (cell === null) return ''
  if (typeof cell === 'number') return String(cell)
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** One table as CSV: a byte-order mark so Excel reads it as UTF-8, CRLF line ends. */
export function toCsv(table: Table): string {
  const lines = [table.header, ...table.rows].map((row) => row.map(csvCell).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** Text made safe for XML: escaped, and without the control characters XML forbids. */
export function xmlText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** "A", "B", … "Z", "AA": a column's letters from its 0-based index. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

/**
 * Sheet names Excel accepts: at most 31 characters, none of : \ / ? * [ ], and unique
 * in the workbook (a repeat gets " 2", " 3").
 */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base =
      raw
        .replace(/[:\\/?*[\]]/g, ' ')
        .trim()
        .slice(0, 31) || 'Sheet'
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const suffix = ` ${String(n)}`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())
    return name
  })
}

function cellXml(cell: Cell, ref: string, header: boolean): string {
  const style = header ? ' s="1"' : ''
  if (cell === null || cell === '') return ''
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"${style}><v>${String(cell)}</v></c>`
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(cell))}</t></is></c>`
}

function sheetXml(table: Table): string {
  const all = [table.header, ...table.rows]
  const widths = table.header.map((_, col) =>
    Math.min(60, Math.max(8, ...all.map((row) => String(row[col] ?? '').length + 2))),
  )
  const cols = widths
    .map(
      (w, i) =>
        `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(w)}" customWidth="1"/>`,
    )
    .join('')
  const rows = all
    .map((row, r) => {
      const cells = row
        .map((cell, c) => cellXml(cell, `${columnName(c)}${String(r + 1)}`, r === 0))
        .join('')
      return `<row r="${String(r + 1)}">${cells}</row>`
    })
    .join('')
  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  )
}

/** A workbook with one sheet per table, as the bytes of an .xlsx file. */
export function toXlsx(tables: readonly Table[]): Uint8Array {
  const names = sheetNames(tables.map((t) => t.name))
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${String(i + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      XML_HEAD +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names
          .map(
            (name, i) =>
              `<sheet name="${xmlText(name)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
          )
          .join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names
          .map(
            (_, i) =>
              `<Relationship Id="rId${String(i + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${String(names.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      XML_HEAD +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
  }
  tables.forEach((table, i) => {
    files[`xl/worksheets/sheet${String(i + 1)}.xml`] = strToU8(sheetXml(table))
  })
  return zipSync(files, { level: 6 })
}
