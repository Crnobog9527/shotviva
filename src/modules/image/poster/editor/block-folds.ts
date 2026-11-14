import type { PosterBlock, PosterContent } from '@/core/poster'

// Inside each page tab the editor folds its blocks into titled parts (Owner 2026-11-14: 「赛事海报
// 的这三个要填信息的页面也是要做好分类，不要全部把它平铺开」): the header splits into its masthead
// and its title lines, the rule column into its heading and one part per section, and the page's
// upload boxes form a part of their own. The first part of a tab starts open, the rest folded.

export const MASTHEAD = ['brand', 'brandEn', 'cup', 'cupEn', 'city'] as const
export const TITLE_LINES = ['title', 'subtitle', 'datetimeLabel', 'datetime'] as const
export type HeaderKey = (typeof MASTHEAD)[number] | (typeof TITLE_LINES)[number]

export type Fold =
  | { key: 'masthead' | 'title'; kind: 'header'; keys: readonly HeaderKey[] }
  | { key: 'info'; kind: 'info' }
  | { key: string; kind: 'section'; index: number }
  | { key: 'prizes' | 'table' | 'footer'; kind: 'prizes' | 'table' | 'footer' }
  | { key: 'photos'; kind: 'photos' }

function blockFolds(block: PosterBlock, content: PosterContent): Fold[] {
  if (block === 'header') return [{ key: 'masthead', kind: 'header', keys: MASTHEAD }, { key: 'title', kind: 'header', keys: TITLE_LINES }]
  if (block === 'sections') return [{ key: 'info', kind: 'info' }, ...content.sections.map((_, index): Fold => ({ key: `section-${index}`, kind: 'section', index }))]
  return [{ key: block, kind: block }]
}

// A tab's parts in order: its blocks, then its upload boxes when the page has any.
export function foldsOf(blocks: readonly PosterBlock[], content: PosterContent, photos: boolean): Fold[] {
  return [...blocks.flatMap((block) => blockFolds(block, content)), ...(photos ? [{ key: 'photos', kind: 'photos' } as const] : [])]
}

type Value = { path: string; text: string }

const header = (content: PosterContent, keys: readonly HeaderKey[]): Value[] => keys.map((key) => ({ path: `header.${key}`, text: content.header[key] }))

function prizeValues(content: PosterContent): Value[] {
  const prizes = content.prizes
  if (!prizes) return []
  return [
    { path: 'prizes.headline', text: prizes.headline }, { path: 'prizes.note', text: prizes.note },
    ...prizes.rows.flatMap((row, i) => (['rank', 'rankEn', 'prize'] as const).map((key) => ({ path: `prizes.rows.${i}.${key}`, text: row[key] }))),
  ]
}

function tableValues(content: PosterContent): Value[] {
  const table = content.table
  if (!table) return []
  const rows = table.rows.flatMap((row, r) => (Array.isArray(row) ? row.map((cell, c) => ({ path: `table.rows.${r}.${c}`, text: cell })) : [{ path: `table.rows.${r}.break`, text: row.break }]))
  return [{ path: 'table.title', text: table.title }, ...table.columns.map((text, c) => ({ path: `table.columns.${c}`, text })), ...rows, { path: 'table.footnote', text: table.footnote }]
}

function footerValues(content: PosterContent): Value[] {
  const { phones, phonesLabel, addressLabel, address, qrLabel } = content.footer
  return [{ path: 'footer.phones', text: phones.join('') }, ...Object.entries({ phonesLabel, addressLabel, address, qrLabel }).map(([key, text]) => ({ path: `footer.${key}`, text }))]
}

function foldValues(fold: Fold, content: PosterContent): Value[] {
  switch (fold.kind) {
    case 'header': return header(content, fold.keys)
    case 'info': return [{ path: 'info.title', text: content.info.title }, { path: 'info.titleEn', text: content.info.titleEn }]
    case 'section': {
      const section = content.sections[fold.index]
      return section ? [{ path: `sections.${fold.index}.title`, text: section.title }, { path: `sections.${fold.index}.lines`, text: section.lines.join('') }] : []
    }
    case 'prizes': return prizeValues(content)
    case 'table': return tableValues(content)
    case 'footer': return footerValues(content)
    case 'photos': return []
  }
}

// The lines a part holds that the paste check flagged (ARCHITECTURE §5.3 逐字校验).
function flaggedIn(fold: Fold, unverified: readonly string[]): number {
  if (fold.kind === 'header') return unverified.filter((path) => fold.keys.some((key) => path === `header.${key}`)).length
  const prefix = fold.kind === 'section' ? `sections.${fold.index}.` : fold.kind === 'photos' ? null : `${fold.kind}.`
  return prefix ? unverified.filter((path) => path.startsWith(prefix)).length : 0
}

export type FoldStats = { filled: number; total: number; flagged: number }

export function foldStats(fold: Fold, content: PosterContent, unverified: readonly string[]): FoldStats {
  const values = foldValues(fold, content)
  return { filled: values.filter((value) => value.text.trim() !== '').length, total: values.length, flagged: flaggedIn(fold, unverified) }
}
