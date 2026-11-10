import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage/object-store'
import { r2Store } from '@/core/storage/r2-store'

export async function removeReferenceObjects(db: SupabaseClient, actor: string, store: ObjectStore, keys: string[]) {
  // R2 DELETE is idempotent. A failed delete or ACK remains durable for the next drain.
  const removed: string[] = []
  for (let start = 0; start < keys.length; start += 8) {
    const batch = keys.slice(start, start + 8)
    const results = await Promise.allSettled(batch.map(key => store.delete(key)))
    removed.push(...batch.filter((_, i) => results[i].status === 'fulfilled'))
  }
  if (removed.length) {
    const ack = await db.rpc('admin_ack_reference_deletions', { p_actor: actor, p_keys: removed })
    if (ack.error) throw new AppError('INTERNAL', '素材清理结果暂时无法保存')
  }
  return removed.length
}

export async function drainReferenceDeletions(db: SupabaseClient, actor: string, store?: ObjectStore) {
  // The DB applies its own lease clock and skips candidate rows locked by a registration.
  const { data, error } = await db.rpc('admin_due_reference_deletions', { p_actor: actor })
  if (error) throw new AppError('INTERNAL', '素材清理队列暂时无法读取')
  if (!data?.length) return 0
  return removeReferenceObjects(db, actor, store ?? r2Store(), data.map((row: { r2_key: string }) => row.r2_key))
}
