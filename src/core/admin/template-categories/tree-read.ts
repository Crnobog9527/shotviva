import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { CATEGORY_COLUMNS, toCategory } from '@/core/templates/categories'
import type { TaxonomyRow } from '@/core/templates/taxonomy'
import { treeOrder } from '../ui/category-tree'
import type { AdminCategoryNode } from './types'

type Count = { count: number }[]
type Row = TaxonomyRow & { is_visible: boolean; admin_assigned_template_count: number; series: Count }
const COLUMNS = CATEGORY_COLUMNS + ',parent_id,level,slug,is_visible,seo_title_en,seo_title_zh,seo_description_en,seo_description_zh,' +
  'admin_assigned_template_count,series:template_series(count)'

function toNode(row: Row): AdminCategoryNode {
  return {
    ...toCategory(row), parentId: row.parent_id, level: row.level, slug: row.slug, isVisible: row.is_visible,
    seoTitleEn: row.seo_title_en, seoTitleZh: row.seo_title_zh, seoDescriptionEn: row.seo_description_en,
    seoDescriptionZh: row.seo_description_zh, seriesCount: row.series[0]?.count ?? 0,
    templateCount: row.admin_assigned_template_count,
  }
}

export async function listAdminCategoryTree(client: SupabaseClient): Promise<AdminCategoryNode[]> {
  const nodes: AdminCategoryNode[] = []
  for (;;) {
    const query = client.from('template_categories').select(COLUMNS)
      .eq('kind', 'template').order('key').limit(250)
    const last = nodes.at(-1)
    if (last) query.gt('key', last.key)
    const { data, error } = await query.returns<Row[]>()
    if (error) throw new AppError('INTERNAL', `listAdminCategoryTree failed: ${error.message}`)
    nodes.push(...data.map(toNode))
    if (data.length < 250) return treeOrder(nodes)
  }
}
