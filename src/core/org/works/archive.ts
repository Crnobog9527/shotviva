import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing/rpc'
import { workThumbKeyFor, writeWorkThumb, type ObjectStore } from '../../storage'

// Account deletion must never take the org's works with it (control 2026-11-22, migration 1971):
// archive_org_works files every finished org work of the account under its org, then the files are
// copied to org-works/<org_id>/ inside the bucket (no bytes pass the function), before account
// deletion removes outputs/<user>/. Throws when a result cannot be copied, so nothing is deleted
// and the user can retry; a repeat copies again. A paid work's small copy is best effort (the
// owner's file route falls back to the full file). A free work's protected small copy is the only
// file of it ever served, so it is required: made from the result when missing, and a failure throws.

const pairs = z.array(z.object({ job_id: z.uuid(), credit_pool: z.enum(['free', 'paid']), source_key: z.string(), archive_key: z.string() }))

// Where archive_org_works (1971) puts a work's result, and its small copy next to it.
export const archiveKeyFor = (orgId: string, jobId: string, outputKey: string) =>
  `org-works/${orgId}/${jobId}${outputKey.match(/\.[a-z0-9]{2,5}$/)?.[0] ?? '.png'}`

export const archiveThumbKey = (archiveKey: string) => archiveKey.replace(/\.[a-z0-9]{2,5}$/i, '') + '-thumb.webp'

export async function archiveOrgWorksOf(deps: { db: SupabaseClient; store: ObjectStore }, userId: string): Promise<number> {
  const rows = await callRpc(deps.db, 'archive_org_works', { p_user_id: z.uuid().parse(userId) }, pairs)
  for (const row of rows) {
    // Already copied by an earlier try whose deletion then failed: the source may be gone.
    if (!(await deps.store.head(row.archive_key))) await deps.store.copy(row.source_key, row.archive_key)
    if (row.credit_pool === 'free') await keepFreeThumb(deps.store, userId, row)
    else await keepPaidThumb(deps.store, userId, row)
  }
  return rows.length
}

type Pair = z.infer<typeof pairs>[number]

async function keepPaidThumb(store: ObjectStore, userId: string, row: Pair) {
  const thumb = workThumbKeyFor(userId, row.job_id, 'paid')
  try {
    if (await store.head(thumb)) await store.copy(thumb, archiveThumbKey(row.archive_key))
  } catch {
    // Best effort, see above.
  }
}

async function keepFreeThumb(store: ObjectStore, userId: string, row: Pair) {
  const target = archiveThumbKey(row.archive_key)
  if (await store.head(target)) return
  const thumb = workThumbKeyFor(userId, row.job_id, 'free')
  if (!(await store.head(thumb))) {
    const made = await writeWorkThumb(store, { userId, jobId: row.job_id, bytes: await store.get(row.archive_key), pool: 'free' })
    if (!made) throw new Error(`protected copy of ${row.job_id} not made`)
  }
  await store.copy(thumb, target)
}
