import type { PosterContent, PosterFields, PosterSection, PosterTable, TableRow } from '@/core/poster'

// Immutable edits of the poster text the editor shows (ARCHITECTURE §5.3). Pure, so the editor's
// add / remove / insert-break behaviour is tested without React.

type Header = PosterContent['header']
type Footer = PosterContent['footer']
type PrizeRow = NonNullable<PosterContent['prizes']>['rows'][number]

const EMPTY_HEADER: Header = { brand: '', brandEn: '', cup: '', cupEn: '', city: '', title: '', subtitle: '', datetimeLabel: '', datetime: '' }
const EMPTY_FOOTER: Footer = { phones: [], phonesLabel: '', addressLabel: '', address: '', qrLabel: '' }
const EMPTY_ROW: PrizeRow = { rank: '', rankEn: '', prize: '' }

export function emptyContent(fields: PosterFields): PosterContent {
  const table: PosterTable | null = fields.tableColumns
    ? { title: '', titleEn: '', columns: [...fields.tableColumns], rows: [], footnote: '' }
    : null
  return { header: { ...EMPTY_HEADER }, prizes: null, info: emptyInfo(fields), sections: [], table, footer: { ...EMPTY_FOOTER } }
}

// The sections column's heading as the template starts it, or blank.
export const emptyInfo = (fields: PosterFields): PosterContent['info'] => ({ title: fields.infoHeading?.title ?? '', titleEn: fields.infoHeading?.titleEn ?? '' })

// The sorted text keeps what the model found; an empty heading takes the template's.
export const withDefaults = (content: PosterContent, fields: PosterFields): PosterContent => ({
  ...content,
  info: content.info.title || content.info.titleEn ? content.info : emptyInfo(fields),
  table: content.table ?? emptyContent(fields).table,
})

export const setInfo = (content: PosterContent, key: keyof PosterContent['info'], value: string): PosterContent =>
  ({ ...content, info: { ...content.info, [key]: value } })

export const setHeader = (content: PosterContent, key: keyof Header, value: string): PosterContent =>
  ({ ...content, header: { ...content.header, [key]: value } })

export const setFooter = (content: PosterContent, key: Exclude<keyof Footer, 'phones'>, value: string): PosterContent =>
  ({ ...content, footer: { ...content.footer, [key]: value } })

// Phones are typed one per line.
export const setPhones = (content: PosterContent, text: string): PosterContent =>
  ({ ...content, footer: { ...content.footer, phones: text.split('\n').slice(0, 3) } })

const prizesOf = (content: PosterContent) => content.prizes ?? { headline: '', note: '', rows: [] }

export const setPrizeHeading = (content: PosterContent, key: 'headline' | 'note', value: string): PosterContent =>
  ({ ...content, prizes: { ...prizesOf(content), [key]: value } })

export function setPrize(content: PosterContent, index: number, key: keyof PrizeRow, value: string): PosterContent {
  const prizes = prizesOf(content)
  return { ...content, prizes: { ...prizes, rows: prizes.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)) } }
}

export function addPrize(content: PosterContent): PosterContent {
  const prizes = prizesOf(content)
  return { ...content, prizes: { ...prizes, rows: [...prizes.rows, { ...EMPTY_ROW }] } }
}

export function removePrize(content: PosterContent, index: number): PosterContent {
  const prizes = prizesOf(content)
  return { ...content, prizes: { ...prizes, rows: prizes.rows.filter((_, i) => i !== index) } }
}

export function setSection(content: PosterContent, index: number, change: Partial<PosterSection>): PosterContent {
  return { ...content, sections: content.sections.map((section, i) => (i === index ? { ...section, ...change } : section)) }
}

// A section's lines are edited as one text, one line per poster line. Blank lines stay while the
// user types (Enter starts the next line) and are dropped by tidyContent before saving.
export const linesOf = (text: string): string[] => text.split('\n')

export function tidyContent(content: PosterContent): PosterContent {
  const filled = (lines: readonly string[]) => lines.map((line) => line.trim()).filter(Boolean)
  return {
    ...content,
    sections: content.sections.map((section) => ({ ...section, lines: filled(section.lines) })),
    footer: { ...content.footer, phones: filled(content.footer.phones) },
  }
}

export const addSection = (content: PosterContent): PosterContent =>
  ({ ...content, sections: [...content.sections, { title: '', style: 'numbered', lines: [] }] })

export const removeSection = (content: PosterContent, index: number): PosterContent =>
  ({ ...content, sections: content.sections.filter((_, i) => i !== index) })

function withTable(content: PosterContent, change: (table: PosterTable) => PosterTable): PosterContent {
  return content.table ? { ...content, table: change(content.table) } : content
}

export const setTableText = (content: PosterContent, key: 'title' | 'titleEn' | 'footnote', value: string) =>
  withTable(content, (table) => ({ ...table, [key]: value }))

export const setColumn = (content: PosterContent, index: number, value: string) =>
  withTable(content, (table) => ({ ...table, columns: table.columns.map((column, i) => (i === index ? value : column)) }))

export const setCell = (content: PosterContent, row: number, column: number, value: string) =>
  withTable(content, (table) => ({
    ...table,
    rows: table.rows.map((cells, r) => (r === row && Array.isArray(cells) ? cells.map((cell, c) => (c === column ? value : cell)) : cells)),
  }))

export const setBreak = (content: PosterContent, row: number, value: string) =>
  withTable(content, (table) => ({ ...table, rows: table.rows.map((cells, r) => (r === row && !Array.isArray(cells) ? { break: value } : cells)) }))

// Inserts after `after` (-1: at the top). A data row continues the level column when it can.
export function insertRow(content: PosterContent, after: number, kind: 'data' | 'break'): PosterContent {
  return withTable(content, (table) => {
    const row: TableRow = kind === 'break' ? { break: '' } : table.columns.map((_, c) => (c === 0 ? nextLevel(table.rows, after) : ''))
    return { ...table, rows: [...table.rows.slice(0, after + 1), row, ...table.rows.slice(after + 1)] }
  })
}

function nextLevel(rows: readonly TableRow[], after: number): string {
  const previous = rows.slice(0, after + 1).findLast((row): row is string[] => Array.isArray(row))
  const level = Number(previous?.[0])
  return Number.isInteger(level) && level > 0 ? String(level + 1) : ''
}

export const removeRow = (content: PosterContent, index: number) =>
  withTable(content, (table) => ({ ...table, rows: table.rows.filter((_, i) => i !== index) }))
