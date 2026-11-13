import type { AdminTemplate } from '../templates/types'
import { matchesSearch } from './form-state'

type Labels = { paths: ReadonlyMap<string, { label: string }>; series: ReadonlyMap<string, string> }

// The list's search box (Owner 2026-11-13: 「以后模板多了，根本找不到」): Chinese or English name, id,
// the whole category path as 分类 shows it (e.g. 餐饮 / 中餐 / 中餐暗调质感) and the series name.
// Case-insensitive substring, on whichever tab and filters are chosen.
export function searchCatalog<T extends AdminTemplate>(rows: readonly T[], query: string, labels: Labels): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...rows]
  return rows.filter((template) => {
    if (matchesSearch(template, q)) return true
    const category = labels.paths.get(template.subcategoryKey ?? template.category)?.label ?? ''
    const series = template.seriesId ? labels.series.get(template.seriesId) ?? '' : ''
    return [category, series].some((text) => text.toLowerCase().includes(q))
  })
}
