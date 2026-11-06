import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

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
