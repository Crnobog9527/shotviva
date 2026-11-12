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
