import type { ActionResult } from '../templates/types'

// The languages whose home page, featured list and Create categories can be set apart
// (migration 1575). Mirrors the check constraint on the two tables.
export const DISPLAY_LOCALES = ['en', 'zh'] as const
export type DisplayLocale = (typeof DISPLAY_LOCALES)[number]

// One language's draft (migration 2003). groups: only the sibling groups that changed, each the
// whole group in the new order, or empty to follow the shared order again. featured: the whole
// list, empty to follow the shared list, or null when the list did not change.
export type SaveLocaleDisplayInput = {
  locale: DisplayLocale
  groups: { parent: string | null; keys: string[] }[]
  featured: string[] | null
  // 精选组合 (migration 2005): the language's whole bundle list, or null when it did not change.
  bundles?: string[] | null
}

export type LocaleDisplayActions = {
  save: (input: SaveLocaleDisplayInput) => Promise<ActionResult>
}
