import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing/rpc'
import { AppError } from '../../errors'
import { deleteWorkFiles } from '../../jobs/kept-inputs'
import { jobRowSchema } from '../../jobs/job-schema'
import { logger } from '../../logger'
import type { ObjectStore } from '../../storage'
import { archiveThumbKey } from './archive'

// The owner deletes one of the org's works from 企业作品 (Owner 2026-11-22: only the org's owner
// deletes org works). A live work: org_owner_delete_work marks it deleted and writes the audit row
// in one round trip (a running one is CONFLICT), then its files go the way a member's own delete
// removes them. A work of a deleted account (archived, 1971): org_owner_delete_archived_work does
// the same for the archive row and returns its file. Anything else is NOT_FOUND. A file that
// will not delete is logged and left.
export async function orgOwnerDeleteWork(deps: { db: SupabaseClient; store: ObjectStore }, req: { owner: string; jobId: string }): Promise<void> {
  const args = z.object({ owner: z.uuid(), jobId: z.uuid() }).parse(req)
  const rpcArgs = { p_owner: args.owner, p_job_id: args.jobId }
  try {
    await deleteWorkFiles(deps.store, await callRpc(deps.db, 'org_owner_delete_work', rpcArgs, jobRowSchema))
    return
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'NOT_FOUND')) throw error
  }
  const key = await callRpc(deps.db, 'org_owner_delete_archived_work', rpcArgs, z.string())
  const results = await Promise.allSettled([key, archiveThumbKey(key)].map((k) => deps.store.delete(k)))
  if (results.some((r) => r.status === 'rejected')) logger.error('archived org work files not deleted', { jobId: args.jobId })
}
