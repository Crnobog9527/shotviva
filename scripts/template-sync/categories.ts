import { z } from 'zod'

import type { SyncTarget } from './sync'
import { SyncError } from './covers'
import { rpcError } from './rpc-error'

// Categories first (2026-11-12): every category a synced series or template is filed under, with
// its ancestors, parents before children, so production never answers SUBCATEGORY_MISSING for a
// category the test site has. Present ones only take the test site's names and position.

const category = z.looseObject({ key: z.string(), level: z.int(), is_system: z.boolean() })
export type CategoryOutcome = { key: string; result: string } | { key: string; error: string }

export async function syncCategories(keys: readonly string[], source: SyncTarget, target: SyncTarget, validateOnly: boolean) {
  if (keys.length === 0) return []
  const read = await source.db.rpc('read_template_category_sync_source', { p_keys: [...new Set(keys)] })
  if (read.error) throw new SyncError('SOURCE_READ_FAILED')
  const rows = z.array(category).parse(read.data)
  const outcomes: CategoryOutcome[] = []
  for (const row of rows) {
    const write = await target.db.rpc('sync_preview_category', { p_category: row, p_validate_only: validateOnly })
    if (write.error) outcomes.push({ key: row.key, error: rpcError(write.error, 'CATEGORY_WRITE').message })
    else outcomes.push({ key: row.key, result: z.string().parse(write.data) })
  }
  return outcomes
}

// The categories the given templates sit in (root and sub-category), read from the source.
export async function templateCategoryKeys(ids: readonly string[], source: SyncTarget) {
  if (ids.length === 0) return []
  const { data, error } = await source.db.from('templates').select('category_key, subcategory_key').in('id', [...ids])
  if (error) throw new SyncError('SOURCE_READ_FAILED')
  return z.array(z.object({ category_key: z.string(), subcategory_key: z.string().nullable() })).parse(data)
    .flatMap((row) => [row.category_key, ...(row.subcategory_key ? [row.subcategory_key] : [])])
}
