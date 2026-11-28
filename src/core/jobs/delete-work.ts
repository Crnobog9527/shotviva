import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { toAppError } from '../errors'
import { logger } from '../logger'
import type { ObjectStore } from '../storage'
import { deleteWorkFiles } from './kept-inputs'
import { deleteOwnJob } from './settlement'

// The owner deletes one of their works (T41, ARCHITECTURE §6.2「删除作品」): delete_own_job marks it
// deleted in one round trip (owner only, finished only, a repeat is fine), then its R2 files go:
// result, 768px preview (T32), kept uploads (T40). The database is the truth: a file that will
// not delete is logged and left, and the work stays deleted. No credits move.
export async function deleteOwnWork(deps: { db: SupabaseClient; store: ObjectStore }, req: { userId: string; jobId: string }): Promise<void> {
  const job = await deleteOwnJob(deps.db, req)
  await deleteWorkFiles(deps.store, job)
}

// Deleting several of one's works at once (作品页改版 PR④): each goes through deleteOwnWork, so
// delete_own_job checks ownership and status per work and no credits move. A work that is someone
// else's, missing or already gone counts as deleted (nothing of the user's is left to show); one
// still generating, an org work (only the org's owner deletes it), or an error is counted and
// stays. The caller bounds how many ids it accepts.
export type DeleteWorksResult = { deleted: number; running: number; org: number; failed: number }

// How many deletes run at once: each is one database call and a few storage deletes.
const AT_ONCE = 5

async function deleteOne(deps: { db: SupabaseClient; store: ObjectStore }, userId: string, jobId: string): Promise<keyof DeleteWorksResult> {
  try {
    await deleteOwnWork(deps, { userId, jobId })
    return 'deleted'
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'NOT_FOUND') return 'deleted'
    if (appError.code === 'CONFLICT') return 'running'
    if (appError.code === 'FORBIDDEN') return 'org'
    logger.error('photos.bulk_delete.failed', { jobId, error: appError.cause ?? appError })
    return 'failed'
  }
}

export async function deleteOwnWorks(deps: { db: SupabaseClient; store: ObjectStore }, userId: string, jobIds: readonly string[]): Promise<DeleteWorksResult> {
  const result: DeleteWorksResult = { deleted: 0, running: 0, org: 0, failed: 0 }
  const ids = [...new Set(jobIds)]
  for (let at = 0; at < ids.length; at += AT_ONCE) {
    const outcomes = await Promise.all(ids.slice(at, at + AT_ONCE).map((id) => deleteOne(deps, userId, id)))
    for (const outcome of outcomes) result[outcome] += 1
  }
  return result
}
