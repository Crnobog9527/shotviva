import type { Metadata } from 'next'

import { CategoriesPanel } from '@/core/admin'
import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { OrderHelp } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { deleteTemplateCategoryAction, saveTemplateCategoryAction } from '../actions'
import { moveTemplateCategoryAction } from '../category-actions'

// 分类 (Owner 2026-11-27, admin template plan P2): the category tree, moved from /admin/templates
// with the same panel and server actions.
export const instant = false

export const metadata: Metadata = { title: '分类' }

export default async function AdminTemplateCategoriesPage() {
  await requireAdmin()
  const categories = await listAdminCategoryTree(createAdminSupabase())
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl grid-cols-1 gap-6 p-6">
      <h1 className="text-xl font-semibold">分类</h1>
      <OrderHelp />
      <CategoriesPanel
        categories={categories}
        actions={{ save: saveTemplateCategoryAction, move: moveTemplateCategoryAction, remove: deleteTemplateCategoryAction }}
      />
    </div>
  )
}
