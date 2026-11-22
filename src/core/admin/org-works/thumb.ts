import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { workThumbKeyFor, type ObjectStore } from '@/core/storage'

// The admin 企业作品 list's small picture (/api/admin/org-works/[jobId]/thumb): where to redirect
// for one org work. Only works stamped with an org (1941) are served here, so this is not a way
// to browse any user's works without the audited 查看作品 (admin_view_work). Finished, not deleted
// works only. A paid work without its small copy falls back to the full file; a free (promotion)
// work only ever gets its protected small copy, as everywhere else. Nothing is written: a missing
// small copy is not made here. Links live 5 minutes and point at R2, no bytes pass through.

const SIGNED_GET_SECONDS = 300

const rowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  org_id: z.uuid().nullable(),
  status: z.enum(['running', 'succeeded', 'failed']),
  output_key: z.string().nullable(),
  credit_pool: z.enum(['free', 'paid']),
  deleted_at: z.string().nullable(),
})

async function exists(store: ObjectStore, key: string): Promise<boolean> {
  try {
    return (await store.head(key)) !== null
  } catch {
    return false
  }
}

type Served = z.infer<typeof rowSchema> & { output_key: string }

// A finished, kept org work, or null for anything else (missing, personal, failed, deleted).
async function servedWork(db: SupabaseClient, id: string): Promise<Served | null> {
  const { data, error } = await db
    .from('generation_jobs')
    .select('id, user_id, org_id, status, output_key, credit_pool, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', 'org work thumb read failed', { cause: new Error(error.message) })
  const row = data ? rowSchema.parse(data) : null
  const served = row?.org_id && row.status === 'succeeded' && row.output_key && !row.deleted_at
  return served ? (row as Served) : null
}

export async function resolveAdminOrgWorkThumb(deps: { db: SupabaseClient; store: ObjectStore }, jobId: unknown): Promise<string> {
  const id = z.uuid().safeParse(jobId)
  const row = id.success ? await servedWork(deps.db, id.data) : null
  if (!row) throw new AppError('NOT_FOUND', 'Not found')
  const thumb = workThumbKeyFor(row.user_id, row.id, row.credit_pool)
  if (await exists(deps.store, thumb)) return deps.store.presignGet(thumb, { expiresInSeconds: SIGNED_GET_SECONDS })
  if (row.credit_pool === 'free') throw new AppError('NOT_FOUND', 'Not found')
  return deps.store.presignGet(row.output_key, { expiresInSeconds: SIGNED_GET_SECONDS })
}
