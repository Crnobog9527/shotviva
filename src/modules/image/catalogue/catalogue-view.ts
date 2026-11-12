import type { CatalogueIndex, CategoryNode, IndexEntry, IndexSeries } from '@/core/templates'

import { categoriesOf, type CatalogueTemplate } from './catalogue-template'

// What Create's grid is made of (T102): single template cards and series cards, each with the
// category path (slugs from the root) it sits under, and the category tree for the filter chips,
// trimmed to the branches that hold a card. Plain data, built on the server, filtered in the
// browser without another read.
// `key` (the stable category key analytics uses) and, on roots, `intro` (分类管理's 首页说明,
// shown under the section heading in All) come from the category tree; the flat fallback has neither.
export type FilterNode = { slug: string; name: string; children: FilterNode[]; key?: string; intro?: string | null }

export type CatalogueSeries = {
  id: string
  slug: string
  name: string
  description: string | null
  // The series' own artwork; null shows its first member's split instead (The Always-Visible
  // Split Rule holds whenever a member's covers stand in).
  cover: string | null
  // The category the series sits in, in the page's language.
  categoryName: string
  members: CatalogueTemplate[]
}

export type GridEntry =
  | { type: 'template'; template: CatalogueTemplate; path: string[] }
  | { type: 'series'; series: CatalogueSeries; path: string[] }

export type CatalogueView = { filters: FilterNode[]; entries: GridEntry[] }

type Placed = { path: string[]; name: string }

function placesOf(tree: readonly CategoryNode[], zh: boolean, into = new Map<string, Placed>()) {
  for (const node of tree) {
    into.set(node.key, { path: node.path, name: zh ? node.nameZh : node.nameEn })
    placesOf(node.children, zh, into)
  }
  return into
}

const startsWith = (path: readonly string[], prefix: readonly string[]) => prefix.every((slug, i) => path[i] === slug)

// Only branches with at least one card: an empty category never shows (ARCHITECTURE §5).
function trim(tree: readonly CategoryNode[], entries: readonly GridEntry[], zh: boolean): FilterNode[] {
  return tree
    .filter((node) => entries.some((entry) => startsWith(entry.path, node.path)))
    .map((node) => ({
      slug: node.slug, key: node.key, name: zh ? node.nameZh : node.nameEn,
      // Only a root's intro is drawn (the section heading in All); deeper levels do not carry it.
      ...(node.path.length === 1 ? { intro: (zh ? node.introZh : node.introEn) ?? null } : {}),
      children: trim(node.children, entries, zh),
    }))
}

// `templates`: every live template the page read, series members included. `index` null (the
// placement read failed): the flat list by root category, as before series existed.
export function buildCatalogueView(index: CatalogueIndex | null, templates: readonly CatalogueTemplate[], zh: boolean): CatalogueView {
  if (!index) {
    const filters = categoriesOf(templates).map(({ key, name }) => ({ slug: key, name, children: [] }))
    return { filters, entries: templates.map((template) => ({ type: 'template', template, path: [template.category] })) }
  }
  const lookup: Lookup = {
    places: placesOf(index.tree, zh),
    templates: new Map(templates.map((template) => [template.id, template])),
    series: new Map(index.series.map((item) => [item.id, item])),
  }
  const entries = index.entries.flatMap((entry) => toGridEntry(entry, lookup))
  return { filters: trim(index.tree, entries, zh), entries }
}

type Lookup = {
  places: Map<string, Placed>
  templates: Map<string, CatalogueTemplate>
  series: Map<string, IndexSeries>
}

// A card whose category, template or every member the page cannot show is dropped, never drawn
// half empty.
function toGridEntry(entry: IndexEntry, { places, templates, series }: Lookup): GridEntry[] {
  const place = places.get(entry.categoryKey)
  if (!place) return []
  if (entry.type === 'template') {
    const template = templates.get(entry.id)
    return template ? [{ type: 'template', template, path: place.path }] : []
  }
  const found = series.get(entry.id)
  if (!found) return []
  const members = found.memberIds.flatMap((id) => templates.get(id) ?? [])
  if (members.length === 0) return []
  const { id, slug, name, description, coverUrl } = found
  return [{ type: 'series', series: { id, slug, name, description, cover: coverUrl, categoryName: place.name, members }, path: place.path }]
}

export const seriesOf = (entries: readonly GridEntry[]) => entries.flatMap((entry) => (entry.type === 'series' ? [entry.series] : []))

// `?series=` takes a slug or an id; anything else opens nothing.
export function findSeries(entries: readonly GridEntry[], wanted: string | null): CatalogueSeries | null {
  if (!wanted) return null
  return seriesOf(entries).find((item) => item.slug === wanted || item.id === wanted) ?? null
}

export { startsWith as pathStartsWith }
