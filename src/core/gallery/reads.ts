import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import { logger } from '../logger'
import { GALLERY_CACHE_TAG } from './cache'

// The public gallery's reads (ARCHITECTURE §9, 创作库规格 U11). Only approved public works in the
// gallery's scope (§9 第 7 条), on generation_jobs_gallery_idx. No cookies inside a cache, so the
// service role reads with the same filters; the columns carry no prompt, no upload key, no user.
// Every read carries the gallery tag that a decision, a deletion or a switch change expires.

export const GALLERY_PAGE_SIZE = 24
export const GALLERY_MAX_PAGES = 20
// A missed expiry (another instance) is bounded to ten minutes.
const GALLERY_LIFE = { revalidate: 600, expire: 3600 } as const

const COLUMNS = 'id, template_id, credit_pool, parent_job_id, inputs, moderated_at'

const rowSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  credit_pool: z.enum(['free', 'paid']),
  parent_job_id: z.string().nullable(),
  inputs: z.record(z.string(), z.unknown()),
  moderated_at: z.string(),
})

export type GalleryRow = { id: string; templateId: string; creditPool: 'free' | 'paid'; parentJobId: string | null; inputs: Record<string, unknown> }

const toRow = (row: z.infer<typeof rowSchema>): GalleryRow => ({
  id: row.id,
  templateId: row.template_id,
  creditPool: row.credit_pool,
  parentJobId: row.parent_job_id,
  // Only what the page may show is kept (public-copy.ts reads `copy`); the rest never leaves.
  inputs: { copy: row.inputs.copy },
})

function shown() {
  return createAdminSupabase()
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
}

export const isWorkId = (raw: string) => z.uuid().safeParse(raw).success

export type GalleryPage = { works: GalleryRow[]; hasNext: boolean }

// One page of the wall, newest decision first; pages past GALLERY_MAX_PAGES do not exist.
export async function cachedGalleryPage(page: number): Promise<GalleryPage> {
  'use cache'
  cacheTag(GALLERY_CACHE_TAG)
  if (!Number.isInteger(page) || page < 1 || page > GALLERY_MAX_PAGES) return { works: [], hasNext: false }
  const from = (page - 1) * GALLERY_PAGE_SIZE
  const { data, error } = await shown()
    .order('moderated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + GALLERY_PAGE_SIZE)
  if (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('gallery.page_read_failed', { page, error: error.message })
    return { works: [], hasNext: false }
  }
  cacheLife(GALLERY_LIFE)
  const rows = z.array(rowSchema).parse(data).map(toRow)
  return { works: rows.slice(0, GALLERY_PAGE_SIZE), hasNext: rows.length > GALLERY_PAGE_SIZE && page < GALLERY_MAX_PAGES }
}

// One work the gallery shows, or null (missing, pending, rejected, private, deleted: all 404).
export async function cachedGalleryWork(id: string): Promise<GalleryRow | null> {
  'use cache'
  cacheTag(GALLERY_CACHE_TAG)
  if (!isWorkId(id)) return null
  const { data, error } = await shown().eq('id', id).maybeSingle()
  if (error) {
    cacheLife(FAILED_READ_LIFE)
    logger.error('gallery.work_read_failed', { error: error.message })
    return null
  }
  cacheLife(GALLERY_LIFE)
  const row = rowSchema.safeParse(data)
  return row.success ? toRow(row.data) : null
}

// The stored image of a work the gallery shows, for the image route. Read per request (never
// cached) so a hidden work's image stops at once on this side, whatever the CDN still holds.
export type ShownImage = { outputKey: string; creditPool: 'free' | 'paid' }

export async function shownImage(id: string): Promise<ShownImage | null> {
  if (!isWorkId(id)) return null
  const { data, error } = await createAdminSupabase()
    .from('generation_jobs')
    .select('output_key, credit_pool')
    .eq('id', id)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'approved')
    .is('deleted_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
    .maybeSingle()
  if (error) throw new Error(error.message)
  const row = z.object({ output_key: z.string(), credit_pool: z.enum(['free', 'paid']) }).safeParse(data)
  return row.success ? { outputKey: row.data.output_key, creditPool: row.data.credit_pool } : null
}
