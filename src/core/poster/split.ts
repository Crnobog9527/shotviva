import { sectionChars, type PosterContent, type PosterPrizes, type PosterSection, type PosterTable, type TableRow } from './content'
import { kindFor, type PosterFields, type PosterKind } from './template'

// One poster of a set (ARCHITECTURE §5.3 拆张): the blocks it shows, in its kind's order. Header
// and footer repeat on every poster. Deterministic: the same content and template always split
// the same way, so the price shown before generating is the price charged.

export type PosterPart = {
  kind: string
  // 1-based position among this kind's posters, and how many there are ("2 / 3").
  page: number
  pages: number
  prizes?: PosterPrizes
  sections?: PosterSection[]
  table?: PosterTable & { continued: boolean }
  // One section longer than a whole poster: shown alone, the editor asks to shorten it.
  oversized?: boolean
}

type Body = Omit<PosterPart, 'kind' | 'page' | 'pages'>

const chunk = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))

function prizeBodies(prizes: PosterPrizes | null, limit: number | undefined): Body[] {
  if (!prizes || prizes.rows.length === 0) return []
  return chunk(prizes.rows, limit ?? prizes.rows.length).map((rows) => ({ prizes: { ...prizes, rows } }))
}

// Sections stay whole and in order; a new poster starts when the next one would not fit.
function sectionPages(sections: readonly PosterSection[], chars: number | undefined): PosterSection[][] {
  const pages: PosterSection[][] = []
  for (const section of sections) {
    const last = pages.at(-1)
    if (last && (chars === undefined || sectionChars([...last, section]) <= chars)) last.push(section)
    else pages.push([section])
  }
  return pages
}

// Table rows in pages of at most `limit`, cut after a break row when one sits in the second half
// of the page, so a continuation starts at a level boundary. Each page repeats the header.
export function tablePages(rows: readonly TableRow[], limit: number): TableRow[][] {
  const pages: TableRow[][] = []
  let start = 0
  while (start < rows.length) {
    let end = Math.min(start + limit, rows.length)
    if (end < rows.length) {
      const breakAt = rows.slice(start, end).findLastIndex((row) => !Array.isArray(row))
      if (breakAt >= Math.ceil(limit / 2)) end = start + breakAt + 1
    }
    pages.push(rows.slice(start, end))
    start = end
  }
  return pages
}

const hasText = (section: PosterSection) => Boolean(section.title) || section.lines.length > 0

// The sections and table this kind carries; a table with no rows counts as none.
function rulesOf(content: PosterContent, kind: PosterKind, fields: PosterFields) {
  const sections = kindFor(fields, 'sections') === kind ? content.sections.filter(hasText) : []
  const table = kindFor(fields, 'table') === kind && content.table && content.table.rows.length > 0 ? content.table : null
  return { sections, table }
}

function fitsOnePoster(sections: readonly PosterSection[], table: PosterTable | null, capacity: PosterKind['capacity']) {
  const fitsSections = capacity.chars === undefined || sectionChars(sections) <= capacity.chars
  const fitsTable = !table || capacity.tableRows === undefined || table.rows.length <= capacity.tableRows
  return fitsSections && fitsTable
}

function sectionBodies(sections: readonly PosterSection[], chars: number | undefined): Body[] {
  return sectionPages(sections, chars).map((page) => ({
    sections: page, ...(chars !== undefined && sectionChars(page) > chars ? { oversized: true } : {}),
  }))
}

function tableBodies(table: PosterTable | null, limit: number | undefined): Body[] {
  if (!table) return []
  return tablePages(table.rows, limit ?? table.rows.length).map((rows, i) => ({ table: { ...table, rows, continued: i > 0 } }))
}

// Sections and table share one poster when both fit; otherwise sections and table pages follow.
function rulesBodies(content: PosterContent, kind: PosterKind, fields: PosterFields): Body[] {
  const { sections, table } = rulesOf(content, kind, fields)
  if (sections.length === 0 && !table) return []
  if (fitsOnePoster(sections, table, kind.capacity)) {
    return [{ ...(sections.length > 0 ? { sections } : {}), ...(table ? { table: { ...table, continued: false } } : {}) }]
  }
  return [...sectionBodies(sections, kind.capacity.chars), ...tableBodies(table, kind.capacity.tableRows)]
}

function bodiesFor(content: PosterContent, kind: PosterKind, fields: PosterFields): Body[] {
  const prizes = kindFor(fields, 'prizes') === kind ? prizeBodies(content.prizes, kind.capacity.prizeRows) : []
  return [...prizes, ...rulesBodies(content, kind, fields)]
}

export function splitPoster(content: PosterContent, fields: PosterFields): PosterPart[] {
  return fields.kinds.flatMap((kind) => {
    const bodies = bodiesFor(content, kind, fields)
    return bodies.map((body, i) => ({ kind: kind.key, page: i + 1, pages: bodies.length, ...body }))
  })
}
