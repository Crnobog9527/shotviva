import type { TreeItem, TreeMove } from '../ui/category-tree/tree'
import type { Category } from '@/core/templates/categories'

import type { ActionResult, ActionValue } from '../templates/types'

// A category as the admin reads it: how many templates use it, published or not, so the
// delete dialog can say what will move. System categories (isSystem) are left out of
// 分类管理 and the template form's list.
export type AdminCategory = Category & { templateCount: number }

export type AdminCategoryNode = AdminCategory & TreeItem & {
  seriesCount: number
  slug: string
  isVisible: boolean
  seoTitleEn: string | null
  seoTitleZh: string | null
  seoDescriptionEn: string | null
  seoDescriptionZh: string | null
}

export type SaveCategoryPayload = { isNew: boolean; category: unknown }
export type DeleteCategoryPayload = { key: string; moveTo: string | null }

export type CategoryAdminActions = {
  save: (payload: SaveCategoryPayload) => Promise<ActionResult>
  move: (input: TreeMove) => Promise<ActionResult>
  // How many templates moved to `moveTo`.
  remove: (payload: DeleteCategoryPayload) => Promise<ActionValue<{ moved: number }>>
}
