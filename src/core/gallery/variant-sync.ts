import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../logger'
import type { ObjectStore } from '../storage'
import { inGalleryScope } from './scope'
import { deleteGalleryVariants, writeGalleryVariants } from './variants'

// After a moderation decision (a person's, or the automatic approval): approved works get their
// gallery copies, rejected ones lose them. Reads the works again rather than trusting the ids, so
// only a work that really ended up approved and shown is rendered, and only a work that really
// ended up rejected loses its copies. Runs after the response; never throws.

const rowSchema = z.object({
  id: z.string(),
  output_key: z.string().nullable(),
  credit_pool: z.enum(['free', 'paid']),
  moderation_status: z.string(),
  status: z.string(),
  visibility: z.string(),
  deleted_at: z.string().nullable(),
  source: z.string(),
  template_id: z.string(),
})
type Row = z.infer<typeof rowSchema>

// A handful at once: each reads a full original (1–5 MB) and runs sharp twice.
const CONCURRENCY = 4

// The same works the image route serves (reads.ts shownImage).
const isShownApproved = (row: Row) =>
  row.moderation_status === 'approved' &&
  row.status === 'succeeded' &&
  row.visibility === 'public' &&
  row.deleted_at === null &&
  inGalleryScope({ source: row.source, templateId: row.template_id })

async function readRows(db: Pick<SupabaseClient, 'from'>, jobIds: readonly string[]): Promise<Row[]> {
  const { data, error } = await db
    .from('generation_jobs')
    .select('id, output_key, credit_pool, moderation_status, status, visibility, deleted_at, source, template_id')
    .in('id', [...jobIds])
  if (error) throw new Error(error.message)
  return z.array(rowSchema).parse(data)
}

async function syncOne(store: ObjectStore, decision: 'approved' | 'rejected', row: Row): Promise<void> {
  if (!row.output_key) return
  if (decision === 'approved' && isShownApproved(row)) {
    await writeGalleryVariants(store, { id: row.id, outputKey: row.output_key, creditPool: row.credit_pool })
  } else if (decision === 'rejected' && row.moderation_status === 'rejected') {
    await deleteGalleryVariants(store, { id: row.id, outputKey: row.output_key })
  }
}

export async function syncGalleryVariants(
  deps: { db: Pick<SupabaseClient, 'from'>; store: ObjectStore },
  decision: 'approved' | 'rejected',
  jobIds: readonly string[],
): Promise<void> {
  if (jobIds.length === 0) return
  try {
    const rows = await readRows(deps.db, jobIds)
    for (let start = 0; start < rows.length; start += CONCURRENCY) {
      await Promise.all(rows.slice(start, start + CONCURRENCY).map((row) => syncOne(deps.store, decision, row)))
    }
  } catch (error) {
    logger.warn('gallery.variants_sync_failed', { decision, count: jobIds.length, error })
  }
}
