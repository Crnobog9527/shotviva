import type { PosterContent, PosterFields } from '@/core/poster'

import { foldsOf, foldStats } from './block-folds'
import { pageGroups } from './page-groups'

// 去核对 (Owner 2026-11-15): the parts holding yellow lines, in the order the editor shows them
// (tab by tab, part by part), each named by its tab and its fold id, as BlockTabs keys them.
export type FlagStop = { group: string; fold: string }

export function flagStops(poster: PosterFields, content: PosterContent, unverified: readonly string[]): FlagStop[] {
  if (unverified.length === 0) return []
  return pageGroups(poster).flatMap((group) => foldsOf(group.blocks, content, false)
    .filter((fold) => foldStats(fold, content, unverified).flagged > 0)
    .map((fold) => ({ group: group.key, fold: `${group.key}:${fold.key}` })))
}

// Where the next 去核对 lands: the next yellow field of the same part while it has more (`fields`:
// how many it shows now, null when it is not on screen), else the first field of the next part,
// round to the first. A part that is gone (its lines were fixed) moves on to the first stop.
export type FlagCursor = { fold: string; field: number }

export function nextFlag(stops: readonly FlagStop[], cursor: FlagCursor | null, fields: number | null): (FlagStop & { field: number }) | null {
  if (stops.length === 0) return null
  const at = cursor ? stops.findIndex((stop) => stop.fold === cursor.fold) : -1
  if (at < 0 || !cursor) return { ...stops[0]!, field: 0 }
  if (fields === null) return { ...stops[at]!, field: cursor.field }
  if (cursor.field + 1 < fields) return { ...stops[at]!, field: cursor.field + 1 }
  return { ...stops[(at + 1) % stops.length]!, field: 0 }
}
