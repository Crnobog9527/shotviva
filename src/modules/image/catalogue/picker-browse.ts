import type { CatalogueIndex } from '@/core/templates'

import type { CatalogueTemplate } from './catalogue-template'
import { buildCatalogueView, type CatalogueSeries, type CatalogueView, type FilterNode, type GridEntry } from './catalogue-view'

// The home picker's browsing data (Owner 2026-11-13): Create's category tree and card order,
// series as one card each, built on the server from the same cached index Create reads. Templates
// travel by id only: the generator already holds every template, so the page carries the tree
// and the placements, not a second copy of the catalogue.
type SlimSeries = Omit<CatalogueSeries, 'members'> & { memberIds: string[] }
type SlimEntry = { type: 'template'; id: string; path: string[] } | { type: 'series'; series: SlimSeries; path: string[] }
export type PickerBrowse = { filters: FilterNode[]; entries: SlimEntry[] }

// Only what the picker draws: no 首页说明 under the chips.
const slimFilters = (nodes: readonly FilterNode[]): FilterNode[] =>
  nodes.map(({ slug, name, alias, children }) => ({ slug, name, ...(alias ? { alias } : {}), children: slimFilters(children) }))

// null (the index read failed): the picker falls back to its flat list by category.
export function pickerBrowse(index: CatalogueIndex | null, templates: readonly CatalogueTemplate[], zh: boolean): PickerBrowse | null {
  if (!index) return null
  const view = buildCatalogueView(index, templates, zh)
  const entries = view.entries.map((entry): SlimEntry => {
    if (entry.type === 'template') return { type: 'template', id: entry.template.id, path: entry.path }
    const { members, ...series } = entry.series
    return { type: 'series', series: { ...series, memberIds: members.map((member) => member.id) }, path: entry.path }
  })
  return { filters: slimFilters(view.filters), entries }
}

// Back to Create's view over the templates the generator offers (slot templates are not offered:
// a series left with no member, or a card whose template is not here, is dropped). A template
// the index does not place (a cache a moment older than the catalogue) still shows, under All.
export function browseView(browse: PickerBrowse | null, templates: readonly CatalogueTemplate[], zh: boolean): CatalogueView {
  if (!browse) return buildCatalogueView(null, templates, zh)
  const byId = new Map(templates.map((template) => [template.id, template]))
  const placed = new Set<string>()
  const entries = browse.entries.flatMap((entry): GridEntry[] => {
    if (entry.type === 'template') {
      const template = byId.get(entry.id)
      if (template) placed.add(template.id)
      return template ? [{ type: 'template', template, path: entry.path }] : []
    }
    const { memberIds, ...series } = entry.series
    const members = memberIds.flatMap((id) => byId.get(id) ?? [])
    for (const member of members) placed.add(member.id)
    return members.length ? [{ type: 'series', series: { ...series, members }, path: entry.path }] : []
  })
  const rest = templates.filter((template) => !placed.has(template.id)).map((template): GridEntry => ({ type: 'template', template, path: [] }))
  return { filters: browse.filters, entries: [...entries, ...rest] }
}

export type EntryGroup = { key: string; name: string | null; entries: GridEntry[] }

// The list under a chosen category (or All): a heading per category one level below it, in
// 分类管理's order; cards placed on the chosen category itself come first, without a heading.
export function groupEntries(entries: readonly GridEntry[], filters: readonly FilterNode[], path: readonly string[]): EntryGroup[] {
  let level = filters
  for (const slug of path) level = level.find((node) => node.slug === slug)?.children ?? []
  const own: GridEntry[] = []
  const below = new Map<string, GridEntry[]>()
  for (const entry of entries) {
    const slug = entry.path[path.length]
    if (slug === undefined || !level.some((node) => node.slug === slug)) own.push(entry)
    else below.set(slug, [...(below.get(slug) ?? []), entry])
  }
  const groups = level.flatMap((node) => {
    const inside = below.get(node.slug)
    return inside ? [{ key: node.slug, name: node.name, entries: inside }] : []
  })
  return own.length ? [{ key: '~own', name: null, entries: own }, ...groups] : groups
}
