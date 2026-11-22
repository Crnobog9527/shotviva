import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing/rpc'
import { workThumbKeyFor, writeWorkThumb, type ObjectStore } from '../../storage'

// Account deletion must never take the org's works with it (control 2026-11-22, migration 1971):
// archive_org_works files every finished org work of the account under its org, then the files are
// copied to org-works/<org_id>/ inside the bucket (no bytes pass the function), before account
// deletion removes outputs/<user>/. Throws when a result cannot be copied, so nothing is deleted
// and the user can retry; works copied are marked (copied_at, 1973), so a repeat copies only the rest. A paid work's small copy is best effort (the
// owner's file route falls back to the full file). A free work's protected small copy is the only
// file of it ever served, so it is required: made from the result when missing, and a failure throws.

const pairs = z.array(z.object({ job_id: z.uuid(), credit_pool: z.enum(['free', 'paid']), source_key: z.string(), archive_key: z.string() }))

// Where archive_org_works (1971) puts a work's result, and its small copy next to it.
export const archiveKeyFor = (orgId: string, jobId: string, outputKey: string) =>
  `org-works/${orgId}/${jobId}${outputKey.match(/\.[a-z0-9]{2,5}$/)?.[0] ?? '.png'}`

export const archiveThumbKey = (archiveKey: string) => archiveKey.replace(/\.[a-z0-9]{2,5}$/i, '') + '-thumb.webp'

// R2 copies in flight at once: enough for an account with hundreds of org works to finish within
// the route's time limit, few enough not to trip R2's request rate.
export const ARCHIVE_COPY_CONCURRENCY = 12
// Works marked copied per round trip, so a run the platform stops at its time limit keeps what it did.
const MARK_EVERY = 48

// Returns how many works it copied this time (0 on a pass after everything was copied).
export async function archiveOrgWorksOf(deps: { db: SupabaseClient; store: ObjectStore }, userId: string): Promise<number> {
  const user = z.uuid().parse(userId)
  const rows = await callRpc(deps.db, 'archive_org_works', { p_user_id: user }, pairs)
  let copied = 0
  for (let at = 0; at < rows.length; at += MARK_EVERY) {
    const { done, failure } = await copyAll(deps.store, user, rows.slice(at, at + MARK_EVERY))
    // What was copied is marked even when another copy failed, so the retry does only the rest.
    if (done.length > 0) await callRpc(deps.db, 'mark_org_works_copied', { p_user_id: user, p_job_ids: done }, z.number().int())
    copied += done.length
    if (failure !== null) throw failure
  }
  return copied
}

// One chunk, ARCHIVE_COPY_CONCURRENCY at a time; after a failure no new copy starts, and every
// copy in flight settles before this returns.
async function copyAll(store: ObjectStore, userId: string, rows: Pair[]): Promise<{ done: string[]; failure: unknown }> {
  const done: string[] = []
  let failure: unknown = null
  let next = 0
  const worker = async () => {
    while (failure === null && next < rows.length) {
      const row = rows[next++]!
      try {
        await keepWork(store, userId, row)
        done.push(row.job_id)
      } catch (error) {
        failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ARCHIVE_COPY_CONCURRENCY, rows.length) }, worker))
  return { done, failure }
}

async function keepWork(store: ObjectStore, userId: string, row: Pair) {
  // Already copied by an earlier try that stopped before marking it: the source may be gone.
  if (!(await store.head(row.archive_key))) await store.copy(row.source_key, row.archive_key)
  if (row.credit_pool === 'free') await keepFreeThumb(store, userId, row)
  else await keepPaidThumb(store, userId, row)
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
