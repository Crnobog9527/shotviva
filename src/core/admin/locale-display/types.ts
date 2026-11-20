import type { ActionResult } from '../templates/types'

// The languages whose home page, featured list and Create categories can be set apart
// (migration 1575). Mirrors the check constraint on the two tables.
export const DISPLAY_LOCALES = ['en', 'zh'] as const
export type DisplayLocale = (typeof DISPLAY_LOCALES)[number]

export type SetCategoryOrderInput = { locale: DisplayLocale; parent: string | null; keys: string[] }
export type SetFeaturedInput = { locale: DisplayLocale; ids: string[] }

export type LocaleDisplayActions = {
  // keys: the whole sibling group in the new order; empty goes back to following the shared order.
  setCategoryOrder: (input: SetCategoryOrderInput) => Promise<ActionResult>
  // ids: the whole featured list; empty goes back to following the shared list.
  setFeatured: (input: SetFeaturedInput) => Promise<ActionResult>
}
