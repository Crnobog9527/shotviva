import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { DISHWARE_KEY, type DishwareItem } from '../../src/core/dishware/types'
import type { ObjectStore } from '../../src/core/storage'

// Makes one site's vessel library (ARCHITECTURE §5.1c「器皿图库」) match a list of items: each
// item's image is put under its own key (keys carry a content hash, so a re-run writes nothing and a
// different file under the same key is a conflict, never overwritten), then its row is saved through
// admin_save_dishware. Rows the list does not have are switched off, not deleted: a vessel's id may
// still be in a job's logs, and turning it back on is one save.

export type MirrorStore = Pick<ObjectStore, 'head' | 'get' | 'put'>
export type MirrorItem = DishwareItem & { bytes: () => Promise<Uint8Array> }
export type MirrorReport = { written: number; saved: number; deactivated: number }

export class MirrorError extends Error {}

const MAX_BYTES = 20 * 1024 * 1024
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function putImage(store: MirrorStore, item: MirrorItem): Promise<boolean> {
  if (!DISHWARE_KEY.test(item.imageKey)) throw new MirrorError(`DISHWARE_KEY_INVALID ${item.id}`)
  const bytes = await item.bytes()
  const existing = await store.head(item.imageKey)
  if (existing) {
    const stored = existing.size === bytes.length ? await store.get(item.imageKey, MAX_BYTES) : null
    if (!stored || digest(stored) !== digest(bytes)) throw new MirrorError(`DISHWARE_CONFLICT ${item.id}`)
    return false
  }
  await store.put(item.imageKey, bytes, 'image/webp')
  return true
}

const rowOf = (item: DishwareItem) => ({
  id: item.id, label: item.label, category: item.category, shape: item.shape,
  image_key: item.imageKey, width: item.width, height: item.height, is_active: item.isActive,
})

async function save(db: SupabaseClient, actorId: string, item: DishwareItem) {
  const { error } = await db.rpc('admin_save_dishware', { p_item: rowOf(item), p_actor: actorId })
  // The function's own message (NOT_ADMIN, INVALID_INPUT); never the request.
  if (error) throw new MirrorError(`${error.message} ${item.id}`)
}

export async function mirrorDishware(
  target: { db: SupabaseClient; store: MirrorStore; actorId: string; current: readonly DishwareItem[] },
  items: readonly MirrorItem[],
  report: (line: string) => void,
): Promise<MirrorReport> {
  const result: MirrorReport = { written: 0, saved: 0, deactivated: 0 }
  for (const item of items) {
    if (await putImage(target.store, item)) result.written += 1
    await save(target.db, target.actorId, item)
    result.saved += 1
    report(`ok ${item.category} ${item.label}`)
  }
  const kept = new Set(items.map((item) => item.id))
  for (const stale of target.current.filter((item) => !kept.has(item.id) && item.isActive)) {
    await save(target.db, target.actorId, { ...stale, isActive: false })
    result.deactivated += 1
    report(`off ${stale.category} ${stale.label}`)
  }
  return result
}
