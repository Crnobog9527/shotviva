import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { CATEGORY_COLUMNS, toCategory, type CategoryRow } from '@/core/templates/categories'

import type { NodeInput } from './tree-input'
import type { TreeMove } from '../ui/category-tree/tree'
import { categoryRpcError } from './errors'
import type { AdminCategory } from './types'

// Every function expects a service-role client; callers must have passed requireAdmin().

type Row = CategoryRow & { templates: { count: number }[] }

// All categories in display order with their template counts, in one request (the count
// is an embedded aggregate over templates_category_key_idx).
export async function listAdminCategories(client: SupabaseClient): Promise<AdminCategory[]> {
  const { data, error } = await client
    .from('template_categories')
    .select(`${CATEGORY_COLUMNS}, templates(count)`)
    .eq('kind', 'template')
    .is('parent_id', null)
    .order('sort_order', { ascending: true })
    .order('key', { ascending: true })
    .returns<Row[]>()
  if (error) throw new AppError('INTERNAL', `listAdminCategories failed: ${error.message}`)
  return data.map((row) => ({ ...toCategory(row), templateCount: row.templates[0]?.count ?? 0 }))
}

// The admin_save_template_category payload for a validated node (also built by templates:apply).
export function categoryPayload(category: NodeInput) {
  return {
    key: category.key,
    name_en: category.nameEn,
    name_zh: category.nameZh,
    intro_en: category.introEn,
    intro_zh: category.introZh,
    card_style: category.cardStyle,
    parent_id: category.parentId, slug: category.slug, is_visible: category.isVisible,
    seo_title_en: category.seoTitleEn, seo_title_zh: category.seoTitleZh,
    seo_description_en: category.seoDescriptionEn, seo_description_zh: category.seoDescriptionZh,
  }
}

export async function saveCategory(client: SupabaseClient, actor: string, category: NodeInput, isNew: boolean): Promise<void> {
  const p_category = categoryPayload(category)
  const { error } = await client.rpc('admin_save_template_category', { p_category, p_is_new: isNew, p_actor: actor })
  if (error) throw categoryRpcError('admin_save_template_category', error)
}

export async function reorderCategories(client: SupabaseClient, actor: string, keys: string[]): Promise<void> {
  const { error } = await client.rpc('admin_reorder_template_categories', { p_keys: keys, p_actor: actor })
  if (error) throw categoryRpcError('admin_reorder_template_categories', error)
}

export async function deleteCategory(client: SupabaseClient, actor: string, key: string, moveTo: string | null): Promise<number> {
  const { data, error } = await client.rpc('admin_delete_template_category', { p_key: key, p_move_to: moveTo, p_actor: actor })
  if (error) throw categoryRpcError('admin_delete_template_category', error)
  return typeof data === 'number' ? data : 0
}

export async function moveCategory(client: SupabaseClient, actor: string, move: TreeMove): Promise<void> {
  const { error } = await client.rpc('admin_move_template_category', {
    p_key: move.key, p_from_parent: move.fromParent, p_parent: move.parentId, p_before: move.beforeKey, p_actor: actor,
  })
  if (error) throw categoryRpcError('admin_move_template_category', error)
}
