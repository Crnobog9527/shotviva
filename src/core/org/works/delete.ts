import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing/rpc'
import { deleteWorkFiles } from '../../jobs/kept-inputs'
import { jobRowSchema } from '../../jobs/job-schema'
import type { ObjectStore } from '../../storage'

// The owner deletes one of the org's works from 企业作品 (Owner 2026-11-22: only the org's owner
// deletes org works). org_owner_delete_work marks it deleted and writes the audit row in one round
// trip (any other org's work, or none, is NOT_FOUND; a running one CONFLICT), then its files go
// the way a member's own delete removes them. A file that will not delete is logged and left.
export async function orgOwnerDeleteWork(deps: { db: SupabaseClient; store: ObjectStore }, req: { owner: string; jobId: string }): Promise<void> {
  const args = z.object({ owner: z.uuid(), jobId: z.uuid() }).parse(req)
  const job = await callRpc(deps.db, 'org_owner_delete_work', { p_owner: args.owner, p_job_id: args.jobId }, jobRowSchema)
  await deleteWorkFiles(deps.store, job)
}
