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

// Where the editor starts (Owner 2026-11-14: 「要按照案例海报中的表单字段来保留」): the template's
// cover text, every block, row and column there to type over; without one, the bare skeleton.
export const startContent = (fields: PosterFields): PosterContent =>
  fields.sample ? withDefaults(structuredClone(fields.sample), fields) : emptyContent(fields)

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

// What is saved: blank lines dropped, and the rows, table rows and sections a clear left with no
// words at all, so a cleared part the user did not refill never reaches the poster.
export function tidyContent(content: PosterContent): PosterContent {
  const filled = (lines: readonly string[]) => lines.map((line) => line.trim()).filter(Boolean)
  const blank = (values: readonly string[]) => values.every((value) => !value.trim())
  const prizes = content.prizes ? { ...content.prizes, rows: content.prizes.rows.filter((row) => !blank([row.rank, row.rankEn, row.prize])) } : null
  const table = content.table ? { ...content.table, rows: content.table.rows.filter((row) => !blank(Array.isArray(row) ? row : [row.break])) } : null
  return {
    ...content,
    prizes,
    table,
    sections: content.sections.map((section) => ({ ...section, lines: filled(section.lines) })).filter((section) => section.title.trim() || section.lines.length),
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

// Clearing takes the words away and keeps the shape: the rows, the sections and their line style,
// the table's rows and column names stay, blank, ready to be typed over (tidyContent drops what
// stays blank). One part at a time (清空本块) or the whole set (全部清空).
export const clearHeader = (content: PosterContent, keys: readonly (keyof Header)[]): PosterContent =>
  ({ ...content, header: { ...content.header, ...Object.fromEntries(keys.map((key) => [key, ''])) } })

export const clearInfo = (content: PosterContent): PosterContent => ({ ...content, info: { title: '', titleEn: '' } })

export const clearSection = (content: PosterContent, index: number): PosterContent =>
  setSection(content, index, { title: '', lines: [] })

export const clearPrizes = (content: PosterContent): PosterContent => {
  const prizes = prizesOf(content)
  return { ...content, prizes: { headline: '', note: '', rows: prizes.rows.map(() => ({ ...EMPTY_ROW })) } }
}

export const clearTable = (content: PosterContent): PosterContent => withTable(content, (table) => ({
  ...table, title: '', titleEn: '', footnote: '',
  rows: table.rows.map((row): TableRow => (Array.isArray(row) ? row.map(() => '') : { break: '' })),
}))

export const clearFooter = (content: PosterContent): PosterContent => ({ ...content, footer: { ...EMPTY_FOOTER } })

export function clearAll(content: PosterContent): PosterContent {
  const header = clearHeader(content, Object.keys(EMPTY_HEADER) as (keyof Header)[])
  const sections = content.sections.reduce((next, _, i) => clearSection(next, i), header)
  return clearFooter(clearTable(clearPrizes(clearInfo(sections))))
}

// The value at a path ("prizes.rows.2.prize"); a list of lines (phones, a section's lines) reads
// as one text, the way the editor shows it.
function valueAt(content: PosterContent, path: string): string | undefined {
  let value: unknown = content
  for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? value.join('\n') : undefined
  return typeof value === 'string' ? value : undefined
}

// Whether a field still holds the template's sample text, word for word (shown greyer until edited).
export function isSampleText(content: PosterContent, sample: PosterContent | undefined, path: string): boolean {
  const before = sample ? valueAt(sample, path) : undefined
  return Boolean(before?.trim()) && valueAt(content, path) === before
}

// The sample's organiser, phones or address still on the set: the one-line reminder before
// generating (「店名、电话、地址还是示例内容，确认要用吗？」), which never blocks.
export function sampleContactsLeft(content: PosterContent, sample: PosterContent | undefined): boolean {
  if (!sample) return false
  const same = (value: string, before: string) => Boolean(before.trim()) && value.trim() === before.trim()
  return same(content.header.brand, sample.header.brand)
    || same(content.footer.address, sample.footer.address)
    || content.footer.phones.some((phone) => sample.footer.phones.some((before) => same(phone, before)))
}
