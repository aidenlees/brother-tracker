import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { columnName, csvCell, sheetNames, toCsv, toXlsx, xmlText, type Table } from './files'

const table: Table = {
  name: 'Singapore Math',
  header: ['Date', 'Minutes', 'Note'],
  rows: [
    ['2026-11-08', 40, 'Used a bar model, then "checked"'],
    ['2026-11-09', null, '=HYPERLINK("x")'],
  ],
}

describe('export files', () => {
  it('writes CSV a spreadsheet opens as UTF-8, quoting what needs it', () => {
    const csv = toCsv(table)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Date,Minutes,Note',
      '2026-11-08,40,"Used a bar model, then ""checked"""',
      `2026-11-09,,"'=HYPERLINK(""x"")"`,
      '',
    ])
  })

  it('never lets a cell run as a formula', () => {
    for (const start of ['=', '+', '-', '@', '\t']) {
      expect(csvCell(`${start}1+1`).replace(/^"/, '')).toMatch(/^'/)
    }
    expect(csvCell('p. 30 #2')).toBe('p. 30 #2')
    expect(csvCell(-3)).toBe('-3')
  })

  it('names columns like a spreadsheet', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA'])
  })

  it('gives every sheet a name Excel accepts, once', () => {
    expect(
      sheetNames(['Math: week 1/2', 'Math: week 1/2', 'A'.repeat(40), '', 'Comments']),
    ).toEqual(['Math  week 1 2', 'Math  week 1 2 2', 'A'.repeat(31), 'Sheet', 'Comments'])
  })

  it('escapes text for XML and drops characters it forbids', () => {
    expect(xmlText('a < b & "c"\u0007')).toBe('a &lt; b &amp; &quot;c&quot;')
  })

  it('writes a workbook: one sheet per table, a bold frozen header, text and numbers', () => {
    const files = unzipSync(toXlsx([table, { name: 'Retries', header: ['Problem'], rows: [] }]))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ])
    const text = (name: string) => strFromU8(files[name] ?? new Uint8Array())
    expect(text('xl/workbook.xml')).toContain(
      '<sheet name="Singapore Math" sheetId="1" r:id="rId1"/>',
    )
    const sheet = text('xl/worksheets/sheet1.xml')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Date</t></is></c>',
    )
    expect(sheet).toContain('<c r="B2"><v>40</v></c>')
    expect(sheet).toContain('then &quot;checked&quot;')
    // An empty cell is left out, not written as blank text.
    expect(sheet).not.toContain('r="B3"')
  })
})
