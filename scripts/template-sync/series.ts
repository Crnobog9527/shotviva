import { z } from 'zod'

import { copySeriesCover, SyncError } from './covers'
import { rpcError } from './rpc-error'
import type { SyncTarget } from './sync'

// A series by slug (2026-11-12): its definition before its members, its member order after them.

const snapshotSchema = z.object({
  series: z.object({
    slug: z.string(), name_en: z.string(), name_zh: z.string(), description_en: z.string().nullable(),
    description_zh: z.string().nullable(), cover_url: z.string().nullable(), category_key: z.string(),
    sort_order: z.int(), is_active: z.boolean(), show_members: z.boolean(),
  }),
  members: z.array(z.string()),
  // Deleted on the test site (1500–1502): carried to production as a delete, never as a definition.
  deleted: z.boolean().default(false),
})
export type SeriesSnapshot = z.infer<typeof snapshotSchema>

export async function readSeries(slug: string, source: SyncTarget): Promise<SeriesSnapshot> {
  const { data, error } = await source.db.rpc('read_template_series_sync_source', { p_slug: slug })
  if (error) throw new SyncError('SOURCE_READ_FAILED')
  if (!data) throw new SyncError('SERIES_SOURCE_MISSING')
  return snapshotSchema.parse(data)
}

export async function syncSeriesDefinition(snapshot: SeriesSnapshot, source: SyncTarget, target: SyncTarget, validateOnly: boolean) {
  const cover = await copySeriesCover(snapshot.series.cover_url, source.assets, target.assets, validateOnly)
  const write = await target.db.rpc('sync_preview_series', {
    p_series: { ...snapshot.series, cover_url: cover }, p_validate_only: validateOnly,
  })
  if (write.error) throw rpcError(write.error, 'SERIES_WRITE')
  return z.string().parse(write.data)
}

export async function syncSeriesMembers(snapshot: SeriesSnapshot, target: SyncTarget, validateOnly: boolean) {
  const write = await target.db.rpc('sync_preview_series_members', {
    p_slug: snapshot.series.slug, p_members: snapshot.members, p_validate_only: validateOnly,
  })
  if (write.error) throw rpcError(write.error, 'SERIES_MEMBERS_WRITE')
  return z.object({ placed: z.array(z.string()), skipped: z.array(z.string()) }).parse(write.data)
}

// A series deleted on the test site: production unpublishes it if live, moves its members out
// (they stay templates in their categories) and marks it deleted, in one audited step (1502).
export async function syncSeriesDelete(slug: string, actor: { id: string; runId: string }, target: SyncTarget, validateOnly: boolean) {
  const write = await target.db.rpc('sync_preview_series_delete', {
    p_actor: actor.id, p_slug: slug, p_run_id: actor.runId, p_validate_only: validateOnly,
  })
  if (write.error) throw rpcError(write.error, 'SERIES_DELETE')
  const { result, moved, was_live } = z.object({
    result: z.enum(['deleted', 'unchanged', 'absent']), moved: z.int().nonnegative(), was_live: z.boolean(),
  }).parse(write.data)
  if (result === 'absent') return 'deleted on the test site, not on production: nothing to do'
  if (result === 'unchanged') return 'deleted on the test site, already deleted on production'
  return `deleted on the test site: deleted on production${was_live ? ' (was published, now down)' : ''}, ${moved} templates moved out`
}
