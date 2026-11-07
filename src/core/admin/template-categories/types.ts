import type { Category } from '@/core/templates/categories'

import type { ActionResult, ActionValue } from '../templates/types'

// A category as the admin list shows it: how many templates use it, published or not
// (the photo-edit template included), so the delete dialog can say what will move.
export type AdminCategory = Category & { templateCount: number }

export type SaveCategoryPayload = { isNew: boolean; category: unknown }
export type DeleteCategoryPayload = { key: string; moveTo: string | null }

export type CategoryAdminActions = {
  save: (payload: SaveCategoryPayload) => Promise<ActionResult>
  // Every key once, in display order.
  reorder: (keys: string[]) => Promise<ActionResult>
  // How many templates moved to `moveTo`.
  remove: (payload: DeleteCategoryPayload) => Promise<ActionValue<{ moved: number }>>
}
