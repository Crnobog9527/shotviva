import { saveSeriesSchema } from '../../src/core/admin/template-series/validation'
import type { SeriesDetail } from '../../src/core/admin/template-series/types'
import type { PlanItem } from './plan-types'
import type { Batch, SeriesItem } from './schema'
import type { DbState } from './state'

// Series (系列管理). A series is saved twice when it needs both: its fields before the templates
// (a new series must exist for a template to join it), its ordered member list after them (the
// members a template item moved in are in place by then). Both go through
// admin_save_template_series with the series page's validation.

type Fields = ReturnType<typeof saveSeriesSchema.parse>['fields']

function coverUrl(item: SeriesItem, current: SeriesDetail | undefined, afterCovers: Map<string, string | null>) {
  if (item.cover === undefined) return current?.cover_url ?? null
  if (item.cover === null) return null
  if ('url' in item.cover) return item.cover.url
  const url = afterCovers.get(item.cover.template)
  if (!url) throw new Error(`封面模板 ${item.cover.template} 不存在或没有后图`)
  return url
}

export function seriesFields(item: SeriesItem, state: DbState, afterCovers: Map<string, string | null>): Fields {
  const current = state.series.get(item.slug)
  if (!current && !(item.nameEn && item.nameZh && item.category)) throw new Error('新系列要写 nameEn、nameZh 和 category')
  const fields = {
    slug: item.slug, name_en: item.nameEn ?? current!.name_en, name_zh: item.nameZh ?? current!.name_zh,
    description_en: item.descriptionEn !== undefined ? item.descriptionEn : current?.description_en ?? null,
    description_zh: item.descriptionZh !== undefined ? item.descriptionZh : current?.description_zh ?? null,
    cover_url: coverUrl(item, current, afterCovers), category_key: item.category ?? current!.category_key,
    sort_order: item.sortOrder ?? current?.sort_order ?? 0,
    is_active: item.isActive ?? current?.is_active ?? false, show_members: item.showMembers ?? current?.show_members ?? false,
  }
  const parsed = saveSeriesSchema.safeParse({ id: null, revision: null, fields, members: [], reason: item.unpublishReason ?? null })
  if (!parsed.success) throw new Error(`系列字段不对：${parsed.error.issues.map(i => i.path.join('.')).join('、')}`)
  return parsed.data.fields
}

const changed = (current: SeriesDetail, fields: Fields) =>
  (Object.keys(fields) as (keyof Fields)[]).some(key => current[key] !== fields[key])

// `created`: categories this batch creates, saved before any series.
function checks(item: SeriesItem, current: SeriesDetail | undefined, fields: Fields, state: DbState, created: Set<string>) {
  const problems: string[] = []
  const category = state.categories.get(fields.category_key)
  const usable = category ? category.kind === 'template' && !category.is_system : created.has(fields.category_key)
  if (!usable) problems.push(`分类 ${fields.category_key} 不存在或不能用`)
  if (current?.is_active && !fields.is_active && !item.unpublishReason) problems.push('系列下架要写 unpublishReason')
  return problems
}

export function planSeriesFields(item: SeriesItem, state: DbState, fields: Fields, created: Set<string>): PlanItem {
  const current = state.series.get(item.slug)
  const base = { ref: `series:${item.slug}`, kind: 'series' as const, label: item.slug, notes: [] }
  const problems = checks(item, current, fields, state, created)
  if (current && !changed(current, fields)) return { ...base, actions: ['无变化'], ops: [], problems }
  const op = { op: 'save_series', fields, reason: item.unpublishReason ?? null }
  return { ...base, actions: [current ? '更新' : '新建'], ops: [op], problems }
}

// Each explicit member list: who joins (template id → series slug) for the template items, and
// the problems a list has with them.
export function memberTargets(batch: Batch, state: DbState) {
  const targets = new Map<string, string | null>()
  const problems = new Map<string, string[]>()
  const items = new Map(batch.templates.map(t => [t.id, t]))
  for (const series of batch.series) {
    const list: string[] = []
    for (const id of series.members ?? []) {
      const own = items.get(id)?.series
      if (own !== undefined && own !== series.slug) list.push(`模板 ${id} 自己写了 series: ${own ?? 'null'}`)
      else if (!state.templates.has(id) && !items.has(id)) list.push(`成员模板 ${id} 不存在`)
      else targets.set(id, series.slug)
    }
    const members = new Set(series.members ?? [])
    for (const t of batch.templates) {
      if (series.members && t.series === series.slug && !members.has(t.id)) list.push(`模板 ${t.id} 写了 series: ${series.slug}，但不在 members 里`)
    }
    problems.set(series.slug, list)
  }
  return { targets, problems }
}

export function planSeriesMembers(item: SeriesItem, fields: Fields, problems: string[], current: SeriesDetail | undefined): PlanItem | null {
  if (!item.members) return null
  const base = { ref: `series-members:${item.slug}`, kind: 'series' as const, label: `${item.slug}（成员）`, problems, notes: [] }
  const now = current?.members.map(m => m.id) ?? []
  if (now.length === item.members.length && now.every((id, i) => id === item.members?.[i])) return { ...base, actions: ['无变化'], ops: [] }
  const op = { op: 'save_series', fields, members: item.members, reason: item.unpublishReason ?? null }
  return { ...base, actions: [`成员 ${item.members.length} 个`], ops: [op] }
}
