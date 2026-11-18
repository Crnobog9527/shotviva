import type { EntryRow, SeriesRow } from './catalogue-index'

// A single web_template_members read applies the database's publication and sale checks.
// Assemble the two entry types from that same snapshot instead of running those checks again
// through web_catalogue_entries. Keep this in step with that view's two UNION ALL branches.
export type CatalogueMember = {
  id: string
  series_id: string | null
  series_sort_order: number
  sort_order: number
  category_key: string
  standalone: boolean
}
export type CatalogueSeriesRow = SeriesRow & { category_key: string; sort_order: number }

export function catalogueEntries(members: CatalogueMember[], series: CatalogueSeriesRow[], visibleCategories: Set<string>): EntryRow[] {
  const seriesWithMembers = new Set(members.flatMap((member) => member.series_id ? [member.series_id] : []))
  const entries: EntryRow[] = members.filter((member) => member.standalone).map((member) => ({
    type: 'template', entry_key: `template-${member.id}`, sort_order: member.sort_order,
    category_key: member.category_key, template_id: member.id, series_id: null, entry_series: null,
  }))
  for (const item of series) {
    if (!visibleCategories.has(item.category_key) || !seriesWithMembers.has(item.id)) continue
    entries.push({
      type: 'series', entry_key: `series-${item.id}`, sort_order: item.sort_order,
      category_key: item.category_key, template_id: null, series_id: item.id, entry_series: item,
    })
  }
  return entries.sort((a, b) => a.sort_order - b.sort_order || (a.entry_key < b.entry_key ? -1 : a.entry_key > b.entry_key ? 1 : 0))
}
