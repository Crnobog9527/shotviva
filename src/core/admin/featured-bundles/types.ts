import type { ActionResult, ActionValue } from '../templates/types'

// 精选组合 (migration 2004): an admin-named set of 2-8 published web templates, shown on the home
// page as one card in its own group.
export const BUNDLE_MIN = 2
export const BUNDLE_MAX = 8

export type SaveBundleInput = { id: string | null; nameEn: string; nameZh: string; templateIds: string[] }

export type FeaturedBundleActions = {
  // Creates (id null) or replaces a bundle; the value is its id.
  save: (input: SaveBundleInput) => Promise<ActionValue<string>>
  remove: (id: string) => Promise<ActionResult>
  // The bundles in the default 首页精选, whole list in order.
  setDefault: (ids: string[]) => Promise<ActionResult>
}
