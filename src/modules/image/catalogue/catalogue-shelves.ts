import type { CatalogueTemplate } from './catalogue-template'
import type { CatalogueSeries, FilterNode, GridEntry } from './catalogue-view'

// A chosen category in Create (Owner 2026-11-25): each series is a shelf (its name, how many it
// holds, 「查看全部」 and a row of its templates), and the templates in no series are the ordinary
// grid below the shelves. A series is not drawn as a shelf when it only repeats the category: its
// name is the chosen category's name, or it is the one thing the category holds. Its templates
// then join the grid where it stood, so 「中餐暗调质感」 shows its templates, not a series of them.
export type ShelfLayout = { shelves: CatalogueSeries[]; grid: GridEntry[] }

// Templates a shelf draws before its 「+N 个」 tile, which opens the whole series.
export const SHELF_LIMIT = 6

// 「中餐 · 暗调质感」 and 「中餐暗调质感」 are the same name: case, spaces and punctuation aside.
export const sameName = (a: string, b: string) => nameKey(a) !== '' && nameKey(a) === nameKey(b)
const nameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

const flat = (series: CatalogueSeries, path: string[]): GridEntry[] =>
  series.members.map((template) => ({ type: 'template', template, path }))

// `shown`: the chosen category's cards (and its sub-categories'), in the catalogue's order.
// `category`: the chosen category's name in the page's language.
export function shelveEntries(shown: readonly GridEntry[], category: string | null): ShelfLayout {
  const series = shown.flatMap((entry) => (entry.type === 'series' ? [entry.series] : []))
  if (series.length === 1 && shown.length === 1) return { shelves: [], grid: shown.flatMap((entry) => (entry.type === 'series' ? flat(entry.series, entry.path) : [entry])) }
  const shelves: CatalogueSeries[] = []
  const grid: GridEntry[] = []
  for (const entry of shown) {
    if (entry.type === 'template') grid.push(entry)
    else if (category !== null && sameName(entry.series.name, category)) grid.push(...flat(entry.series, entry.path))
    else shelves.push(entry.series)
  }
  return { shelves, grid }
}

// The name of the category a path chooses, or null for All (or a path the tree does not hold).
export function categoryNameAt(filters: readonly FilterNode[], path: readonly string[]): string | null {
  let level = filters
  let name: string | null = null
  for (const slug of path) {
    const node = level.find((item) => item.slug === slug)
    if (!node) return null
    name = node.name
    level = node.children
  }
  return name
}

export const shelfMembers = (series: CatalogueSeries): CatalogueTemplate[] => series.members.slice(0, SHELF_LIMIT)
