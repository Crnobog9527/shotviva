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
}

// The shared order each list returns to on 恢复跟随默认.
export type SharedLists = { groups: Record<string, string[]>; featured: string[] }

const ROOT = ''
export const groupKey = (parent: string | null) => parent ?? ROOT
const parentOf = (key: string) => (key === ROOT ? null : key)
const sameIds = (a: readonly string[], b: readonly string[]) => a.join('\n') === b.join('\n')
const sameList = (a: DraftList, b: DraftList) => a.own === b.own && sameIds(a.ids, b.ids)

export function toDraft(groups: readonly SiblingGroup[], featured: FeaturedState): LocaleDraft {
  return {
    groups: Object.fromEntries(groups.map((group) => [groupKey(group.parent), { own: group.own, ids: [...group.keys] }])),
    featured: { own: featured.own, ids: [...featured.ids] },
  }
}

export function sharedLists(groups: readonly SiblingGroup[], featured: FeaturedState): SharedLists {
  return { groups: Object.fromEntries(groups.map((group) => [groupKey(group.parent), [...group.keys]])), featured: [...featured.ids] }
}

export function reorderGroup(draft: LocaleDraft, parent: string | null, ids: string[]): LocaleDraft {
  return { ...draft, groups: { ...draft.groups, [groupKey(parent)]: { own: true, ids } } }
}

export function resetGroup(draft: LocaleDraft, parent: string | null, shared: SharedLists): LocaleDraft {
  const key = groupKey(parent)
  return { ...draft, groups: { ...draft.groups, [key]: { own: false, ids: [...(shared.groups[key] ?? [])] } } }
}

// Any change makes the list the language's own; emptying it follows the shared list again, as
// the server does with an empty list.
export function setFeatured(draft: LocaleDraft, ids: string[], shared: SharedLists): LocaleDraft {
  return { ...draft, featured: ids.length > 0 ? { own: true, ids } : { own: false, ids: [...shared.featured] } }
}

export function resetFeatured(draft: LocaleDraft, shared: SharedLists): LocaleDraft {
  return { ...draft, featured: { own: false, ids: [...shared.featured] } }
}

// What 保存 sends: the groups that differ from the saved state and the featured list if it
// differs; a list back on the shared order is sent empty.
export function draftChanges(saved: LocaleDraft, draft: LocaleDraft): Omit<SaveLocaleDisplayInput, 'locale'> {
  const groups = Object.entries(draft.groups)
    .filter(([key, list]) => !saved.groups[key] || !sameList(saved.groups[key], list))
    .map(([key, list]) => ({ parent: parentOf(key), keys: list.own ? list.ids : [] }))
  const featured = sameList(saved.featured, draft.featured) ? null : draft.featured.own ? draft.featured.ids : []
  return { groups, featured }
}

export const hasChanges = (changes: Omit<SaveLocaleDisplayInput, 'locale'>) => changes.groups.length > 0 || changes.featured !== null
