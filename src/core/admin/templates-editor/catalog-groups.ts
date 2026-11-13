import type { AdminTemplate } from '../templates/types'
import { catalogCopy } from './copy'

export type CatalogStatus = 'active' | 'inactive' | 'all' | 'deleted'
export type SeriesOption = { id: string; nameZh: string }
export const SINGLE_TEMPLATES = 'single'

type CatalogRow = Pick<AdminTemplate, 'id' | 'category' | 'subcategoryKey' | 'seriesId' | 'seriesSortOrder' | 'isActive'>
type CategoryPath = { key: string; label: string; path: readonly string[] }

export function filterCatalog<T extends CatalogRow>(
  templates: readonly T[], paths: ReadonlyMap<string, CategoryPath>, category: string, series: string,
) {
  return templates.filter(template => {
    const assigned = template.subcategoryKey ?? template.category
    const path = paths.get(assigned)?.path ?? [template.category]
    return (!category || path.includes(category)) && (!series || (template.seriesId ?? SINGLE_TEMPLATES) === series)
  })
}

function bySeries<T extends CatalogRow>(rows: T[], options: readonly SeriesOption[]) {
  const members = new Map<string, T[]>()
  for (const template of rows) {
    const id = template.seriesId ?? SINGLE_TEMPLATES
    const group = members.get(id)
    if (group) group.push(template)
    else members.set(id, [template])
  }
  // A series can be created between the independent catalogue and options reads.
  const names = new Map(options.map(s => [s.id, s.nameZh]))
  for (const id of members.keys()) {
    if (!names.has(id)) names.set(id, id)
  }
  names.delete(SINGLE_TEMPLATES)
  names.set(SINGLE_TEMPLATES, catalogCopy.single)
  return [...names].flatMap(([id, nameZh]) => {
    const items = members.get(id)
    if (!items) return []
    if (id !== SINGLE_TEMPLATES) items.sort((a, b) =>
      (a.seriesSortOrder ?? 0) - (b.seriesSortOrder ?? 0) || a.id.localeCompare(b.id))
    return [{ id, title: nameZh, rows: items }]
  })
}

export function catalogSections<T extends CatalogRow>(
  rows: T[], status: CatalogStatus, grouped: boolean, series: readonly SeriesOption[],
) {
  if (status === 'deleted') return [{ id: 'deleted', title: null, orderGroup: null, rows }]
  const statuses = status === 'all' ? (['active', 'inactive'] as const) : [status]
  if (grouped) {
    const matching = status === 'all' ? rows : rows.filter(t => t.isActive === (status === 'active'))
    return bySeries(matching, series).map(group => ({ ...group, orderGroup: null }))
  }
  return statuses.map(key => ({
    id: key, title: status === 'all' ? catalogCopy[key] : null, orderGroup: key,
    rows: rows.filter(t => t.isActive === (key === 'active')),
  }))
}
