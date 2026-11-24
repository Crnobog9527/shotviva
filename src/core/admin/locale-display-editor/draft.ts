import type { SaveLocaleDisplayInput } from '../locale-display/types'
import type { FeaturedState, SiblingGroup } from './display-state'

// One language's 分语言展示 as the admin arranges it before 保存 (Owner 2026-11-25): every drag,
// arrow, add and remove changes only this, and 保存 sends the difference in one call.

// A list and whether it is the language's own or follows the shared one.
export type DraftList = { own: boolean; ids: string[] }

export type LocaleDraft = {
  // Sibling groups by parent key ('' is the top level), in the order shown.
  groups: Record<string, DraftList>
  featured: DraftList
  // 精选组合 ids in order; the language's own while `featured.own`, else the default ones.
  bundles: string[]
}

// The shared order each list returns to on 恢复跟随默认.
export type SharedLists = { groups: Record<string, string[]>; featured: string[]; bundles: string[] }

const ROOT = ''
export const groupKey = (parent: string | null) => parent ?? ROOT
const parentOf = (key: string) => (key === ROOT ? null : key)
const sameIds = (a: readonly string[], b: readonly string[]) => a.join('\n') === b.join('\n')
const sameList = (a: DraftList, b: DraftList) => a.own === b.own && sameIds(a.ids, b.ids)

export function toDraft(groups: readonly SiblingGroup[], featured: FeaturedState, bundles: readonly string[] = []): LocaleDraft {
  return {
    groups: Object.fromEntries(groups.map((group) => [groupKey(group.parent), { own: group.own, ids: [...group.keys] }])),
    featured: { own: featured.own, ids: [...featured.ids] },
    bundles: [...bundles],
  }
}

export function sharedLists(groups: readonly SiblingGroup[], featured: FeaturedState, bundles: readonly string[] = []): SharedLists {
  return { groups: Object.fromEntries(groups.map((group) => [groupKey(group.parent), [...group.keys]])), featured: [...featured.ids], bundles: [...bundles] }
}

export function reorderGroup(draft: LocaleDraft, parent: string | null, ids: string[]): LocaleDraft {
  return { ...draft, groups: { ...draft.groups, [groupKey(parent)]: { own: true, ids } } }
}

export function resetGroup(draft: LocaleDraft, parent: string | null, shared: SharedLists): LocaleDraft {
  const key = groupKey(parent)
  return { ...draft, groups: { ...draft.groups, [key]: { own: false, ids: [...(shared.groups[key] ?? [])] } } }
}

// Any change makes the list the language's own; emptying it follows the shared list again, as
// the server does with an empty list, and the bundles with it.
export function setFeatured(draft: LocaleDraft, ids: string[], shared: SharedLists): LocaleDraft {
  return ids.length > 0 ? { ...draft, featured: { own: true, ids } } : resetFeatured(draft, shared)
}

export function resetFeatured(draft: LocaleDraft, shared: SharedLists): LocaleDraft {
  return { ...draft, featured: { own: false, ids: [...shared.featured] }, bundles: [...shared.bundles] }
}

// A language keeps its own bundles only beside its own featured list (migration 2005), so
// arranging them makes the featured templates its own too, starting from what it shows now.
export function setBundles(draft: LocaleDraft, ids: string[]): LocaleDraft {
  return { ...draft, bundles: ids, featured: draft.featured.own ? draft.featured : { own: true, ids: [...draft.featured.ids] } }
}

// What 保存 sends: the groups that differ from the saved state and the featured list if it
// differs; a list back on the shared order is sent empty.
export function draftChanges(saved: LocaleDraft, draft: LocaleDraft): Omit<SaveLocaleDisplayInput, 'locale'> {
  const groups = Object.entries(draft.groups)
    .filter(([key, list]) => !saved.groups[key] || !sameList(saved.groups[key], list))
    .map(([key, list]) => ({ parent: parentOf(key), keys: list.own ? list.ids : [] }))
  const featured = sameList(saved.featured, draft.featured) ? null : draft.featured.own ? draft.featured.ids : []
  // Own bundles are written when they changed or the language just got its own list (it had no
  // rows yet); going back to following clears them on the server by itself.
  const bundles = draft.featured.own && (!saved.featured.own || !sameIds(saved.bundles, draft.bundles)) ? draft.bundles : null
  return { groups, featured, bundles }
}

export const hasChanges = (changes: Omit<SaveLocaleDisplayInput, 'locale'>) =>
  changes.groups.length > 0 || changes.featured !== null || (changes.bundles ?? null) !== null
