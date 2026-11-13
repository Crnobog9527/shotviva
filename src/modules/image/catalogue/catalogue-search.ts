import type { CatalogueTemplate } from './catalogue-template'
import type { FilterNode, GridEntry } from './catalogue-view'

// Template search, shared by the home picker and Create (Owner 2026-11-13): instant, in the
// browser, over data the page already holds. Every word of the query must appear somewhere in
// a template's name, description, category path (in both languages) or its series' name and
// description; case, full-width forms and extra spaces do not matter. Name matches come first,
// then the catalogue's own order.
export type SearchIndex = { template: CatalogueTemplate; name: string; text: string }[]

export const normalizeQuery = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

// The names (and other-language names) of every category along a path.
function pathNames(filters: readonly FilterNode[], path: readonly string[]): string[] {
  const names: string[] = []
  let level = filters
  for (const slug of path) {
    const node = level.find((item) => item.slug === slug)
    if (!node) break
    names.push(node.name, node.alias ?? '')
    level = node.children
  }
  return names
}

// One row per template, series members included, once, in the catalogue's order.
export function buildSearchIndex(entries: readonly GridEntry[], filters: readonly FilterNode[]): SearchIndex {
  const rows = new Map<string, { template: CatalogueTemplate; extra: string[] }>()
  const add = (template: CatalogueTemplate, extra: string[]) => {
    const row = rows.get(template.id)
    if (row) row.extra.push(...extra)
    else rows.set(template.id, { template, extra })
  }
  for (const entry of entries) {
    const names = pathNames(filters, entry.path)
    if (entry.type === 'template') add(entry.template, names)
    else for (const member of entry.series.members) add(member, [...names, entry.series.name, entry.series.description ?? ''])
  }
  return [...rows.values()].map(({ template, extra }) => ({
    template,
    name: normalizeQuery(template.name),
    text: normalizeQuery([template.name, template.description ?? '', template.categoryName, ...extra].join(' ')),
  }))
}

export function searchTemplates(index: SearchIndex, query: string): CatalogueTemplate[] {
  const terms = normalizeQuery(query).split(' ').filter(Boolean)
  if (terms.length === 0) return []
  const rank = (name: string) => (terms.every((term) => name.includes(term)) ? 0 : 1)
  return index
    .filter((row) => terms.every((term) => row.text.includes(term)))
    .map((row, order) => ({ row, order, rank: rank(row.name) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ row }) => row.template)
}
