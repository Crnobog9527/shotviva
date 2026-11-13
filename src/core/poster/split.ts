import { sectionChars, type PosterContent, type PosterPrizes, type PosterSection, type PosterTable } from './content'
import { kindFor, type PosterCapacity, type PosterFields, type PosterKind } from './template'

// The pages of a set (ARCHITECTURE §5.3): exactly one poster per kind of the template, always
// (Owner 2026-11-14: 「这个海报是由完整的第一页和第二页组合在一起一起使用的，不是说内容太多了，就
// 让它拆解」). Header and footer repeat on every page; each content block sits on the first kind
// that lists it. A page whose text passes its kind's capacity is marked `over`, one with nothing
// of its own `empty`: the editor says which page to shorten or fill, and saving refuses either.
// Deterministic, so the price shown before generating is the price charged.

export const PAGE_LIMITS = ['prizeRows', 'chars', 'tableRows'] as const
export type PageLimit = (typeof PAGE_LIMITS)[number]

export type PosterPart = {
  kind: string
  // 1-based place of this page in the set, and how many pages the set has ("2 / 2").
  page: number
  pages: number
  prizes?: PosterPrizes
  sections?: PosterSection[]
  // `continued` stays for sets saved when a long table could run onto a further page.
  table?: PosterTable & { continued: boolean }
  over?: PageLimit[]
  empty?: true
}

const hasText = (section: PosterSection) => Boolean(section.title) || section.lines.length > 0

// The blocks this kind carries; an empty prize list or a table with no rows counts as none.
function bodyOf(content: PosterContent, kind: PosterKind, fields: PosterFields) {
  const owns = (block: 'prizes' | 'sections' | 'table') => kindFor(fields, block) === kind
  const prizes = owns('prizes') && content.prizes && content.prizes.rows.length > 0 ? content.prizes : null
  const sections = owns('sections') ? content.sections.filter(hasText) : []
  const table = owns('table') && content.table && content.table.rows.length > 0 ? content.table : null
  return { prizes, sections, table }
}

function overOf(body: ReturnType<typeof bodyOf>, capacity: PosterCapacity): PageLimit[] {
  const over: PageLimit[] = []
  if (body.prizes && capacity.prizeRows !== undefined && body.prizes.rows.length > capacity.prizeRows) over.push('prizeRows')
  if (capacity.chars !== undefined && sectionChars(body.sections) > capacity.chars) over.push('chars')
  if (body.table && capacity.tableRows !== undefined && body.table.rows.length > capacity.tableRows) over.push('tableRows')
  return over
}

export function splitPoster(content: PosterContent, fields: PosterFields): PosterPart[] {
  return fields.kinds.map((kind, i) => {
    const body = bodyOf(content, kind, fields)
    const over = overOf(body, kind.capacity)
    const empty = !body.prizes && body.sections.length === 0 && !body.table
    return {
      kind: kind.key, page: i + 1, pages: fields.kinds.length,
      ...(body.prizes ? { prizes: body.prizes } : {}),
      ...(body.sections.length > 0 ? { sections: body.sections } : {}),
      ...(body.table ? { table: { ...body.table, continued: false } } : {}),
      ...(over.length > 0 ? { over } : {}),
      ...(empty ? { empty: true as const } : {}),
    }
  })
}

// Whether every page has its own text and fits: the only sets that can be saved and made.
export const pagesReady = (parts: readonly PosterPart[]) => parts.length > 0 && parts.every((part) => !part.over && !part.empty)
