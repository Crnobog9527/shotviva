import { randomUUID } from 'node:crypto'

import { categoryPayload } from '../../src/core/admin/template-categories/repository'
import { nodeSchema } from '../../src/core/admin/template-categories/tree-input'
import type { PlanItem } from './plan-types'
import type { CategoryItem, ReferenceCategoryItem } from './schema'
import type { CategoryRow, DbState } from './state'

// Category trees (分类管理 and the reference library's tree). A new node is saved under its
// parent; an existing one is saved in place (names, intros, SEO text) and, if the file names
// another parent, moved there with the tree's own move function (to the end of its siblings).

// Parents defined in the same file are saved first.
export function parentsFirst<T extends { key?: string; parent?: string | null }>(items: T[]): T[] {
  const byKey = new Map(items.filter(i => i.key).map(i => [i.key as string, i]))
  const depth = (item: T, seen = 0): number => {
    const parent = item.parent ? byKey.get(item.parent) : undefined
    return parent && seen < 3 ? 1 + depth(parent, seen + 1) : 0
  }
  return [...items].sort((a, b) => depth(a) - depth(b))
}

const same = (row: Record<string, unknown>, payload: Record<string, unknown>) =>
  Object.entries(payload).every(([key, value]) => key === 'parent_id' || value === undefined || (row[key] ?? null) === value)

function nodeFor(item: CategoryItem, row: CategoryRow | undefined) {
  return nodeSchema.parse({
    key: item.key, nameEn: item.nameEn, nameZh: item.nameZh,
    introEn: item.introEn ?? row?.intro_en ?? '', introZh: item.introZh ?? row?.intro_zh ?? '',
    cardStyle: item.cardStyle ?? row?.card_style ?? 'pair',
    parentId: row ? row.parent_id : item.parent ?? null, slug: item.slug, isVisible: item.isVisible,
    seoTitleEn: item.seoTitleEn, seoTitleZh: item.seoTitleZh, seoDescriptionEn: item.seoDescriptionEn, seoDescriptionZh: item.seoDescriptionZh,
  })
}

function moveStep(op: string, key: string, row: CategoryRow | undefined, parent: string | null | undefined) {
  if (!row || parent === undefined || parent === row.parent_id) return []
  return [{ op, key, from_parent: row.parent_id, parent, before: null }]
}

export function planCategory(item: CategoryItem, state: DbState): PlanItem {
  const row = state.categories.get(item.key)
  const base = { ref: `category:${item.key}`, kind: 'category' as const, label: item.key, notes: [] }
  if (row && row.kind !== 'template') return { ...base, actions: [], ops: [], problems: ['这个标识已被参考库分类使用'] }
  if (row?.is_system) return { ...base, actions: [], ops: [], problems: ['系统分类不能修改'] }
  const payload = categoryPayload(nodeFor(item, row))
  const save = !row || !same(row, payload) ? [{ op: 'save_category', category: payload, is_new: !row }] : []
  const ops = [...save, ...moveStep('move_category', item.key, row, item.parent)]
  const actions = ops.map(op => op.op === 'save_category' ? (row ? '更新' : '新建') : `移到 ${item.parent ?? '一级'}`)
  return { ...base, actions: actions.length ? actions : ['无变化'], ops, problems: [] }
}

function findReference(item: ReferenceCategoryItem, state: DbState) {
  if (item.key) return state.categories.get(item.key)
  return [...state.categories.values()].find(row => row.kind === 'reference' && row.name_zh === item.nameZh)
}

export function planReferenceCategory(item: ReferenceCategoryItem, state: DbState): PlanItem {
  const row = findReference(item, state)
  const key = row?.key ?? item.key ?? `ref-${randomUUID()}`
  const base = { ref: `reference:${key}`, kind: 'reference' as const, label: `${item.nameZh}（${key}）`, notes: [] }
  if (row && row.kind !== 'reference') return { ...base, actions: [], ops: [], problems: ['这个标识已被模板分类使用'] }
  const renamed = !row || row.name_en !== item.nameEn || row.name_zh !== item.nameZh
  const save = renamed ? [{ op: 'save_reference_category', key, name_en: item.nameEn, name_zh: item.nameZh,
    parent: row ? row.parent_id : item.parent ?? null, is_new: !row }] : []
  const ops = [...save, ...moveStep('move_reference_category', key, row, item.parent)]
  const actions = ops.map(op => op.op === 'save_reference_category' ? (row ? '改名' : '新建') : `移到 ${item.parent ?? '一级'}`)
  return { ...base, actions: actions.length ? actions : ['无变化'], ops, problems: [] }
}
