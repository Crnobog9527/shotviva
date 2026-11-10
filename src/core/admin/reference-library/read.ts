import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { afterCursor, decodeCursor, encodeCursor } from '../cursor'
import type { AssetPage, ReferenceAsset, ReferenceCategory } from '../reference-library-ui/types'
import { treeOrder } from '../ui/category-tree/tree'
import { assetId, listInput, readInput } from './inputs'

const columns = 'id,category_id,width,height,bytes,source_url,note,tags,status,created_at,reference_template_sources(count)'
const limit = 60
type AssetRow = {
  id: string; category_id: string; width: number; height: number; bytes: number; source_url: string | null
  note: string | null; tags: string[]; status: 'active' | 'archived'; created_at: string
  reference_template_sources: { count: number }[]
}

function toAsset(row: AssetRow): ReferenceAsset {
  return {
    id: row.id, categoryId: row.category_id, width: row.width, height: row.height, bytes: row.bytes,
    sourceUrl: row.source_url, note: row.note, tags: row.tags, status: row.status, createdAt: row.created_at,
    usedInTemplates: row.reference_template_sources[0]?.count ?? 0,
  }
}

export async function referencePage(db: SupabaseClient, input: unknown): Promise<AssetPage> {
  const filters = readInput(listInput, input)
  const ascending = filters.sort === 'oldest'
  const query = db.from('reference_assets').select(columns).eq('status', filters.status)
    .order('created_at', { ascending }).order('id', { ascending }).limit(limit + 1)
  if (filters.categoryId) query.eq('category_id', filters.categoryId)
  if (filters.tag) query.contains('tags', '{"' + filters.tag.replace(/["\\]/g, '\\$&') + '"}')
  if (filters.note) query.ilike('note', '%' + filters.note.replace(/[\\%_*]/g, '\\$&') + '%')
  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor)
    if (!cursor || !assetId.safeParse(cursor.i).success) throw new AppError('INVALID_INPUT', '分页位置无效')
    query.or(afterCursor(cursor, 'id', ascending ? 'gt' : 'lt'))
  }
  const { data, error } = await query.returns<AssetRow[]>()
  if (error) throw new AppError('INTERNAL', '读取素材失败', { cause: error })
  return { items: data.slice(0, limit).map(toAsset), nextCursor: data.length > limit ? encodeCursor(data[limit - 1]) : null }
}

export async function referenceById(db: SupabaseClient, id: string): Promise<ReferenceAsset> {
  const { data, error } = await db.from('reference_assets').select(columns).eq('id', readInput(assetId, id)).maybeSingle<AssetRow>()
  if (error) throw new AppError('INTERNAL', '读取素材失败', { cause: error })
  if (!data) throw new AppError('NOT_FOUND', '找不到这张素材')
  return toAsset(data)
}

const categoryRow = z.object({
  key: z.string(), name_zh: z.string(), name_en: z.string(), parent_id: z.string().nullable(),
  level: z.number(), sort_order: z.number(),
})

export async function referenceCategories(db: SupabaseClient): Promise<ReferenceCategory[]> {
  const nodes: ReferenceCategory[] = []
  for (;;) {
    const query = db.from('template_categories').select('key,name_zh,name_en,parent_id,level,sort_order')
      .eq('kind', 'reference').order('key').limit(250)
    const last = nodes.at(-1)
    if (last) query.gt('key', last.key)
    const { data, error } = await query
    if (error) throw new AppError('INTERNAL', '读取素材分类失败', { cause: error })
    for (const r of categoryRow.array().parse(data)) nodes.push({
      key: r.key, nameZh: r.name_zh, nameEn: r.name_en, parentId: r.parent_id, level: r.level, sortOrder: r.sort_order,
    })
    if (data.length < 250) return treeOrder(nodes)
  }
}
