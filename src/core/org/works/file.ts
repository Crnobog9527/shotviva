import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../../errors'
import { workThumbKeyFor, type ObjectStore } from '../../storage'
import { archiveThumbKey } from './archive'
import { orgOwnerWork } from './reads'

// Same short life as the member's own file routes (core/jobs/job-file.ts).
const SIGNED_GET_SECONDS = 300

export type OrgWorkSize = 'thumb' | 'full'
type Request = { owner: string; jobId: string; size: OrgWorkSize; download: boolean }

// The 企业作品 file route's logic: where to redirect the org owner for one of the org's works.
// Anything that is not a finished org work of the org they own is the same 404 as a missing one.
// A list asks for the small copy and falls back to the full file when there is none. The full
// file is the clean original; a free-pool work (none is expected: org credits are paid) only ever
// gets its protected small copy, as everywhere else no clean free work is signed.
export async function resolveOrgWorkFile(deps: { db: SupabaseClient; store: ObjectStore }, req: Request): Promise<string> {
  const work = await orgOwnerWork(deps.db, req.owner, req.jobId)
  if (!work) throw new AppError('NOT_FOUND', 'Not found')
  // A work of a deleted account (no maker) has its small copy in the archive (1971).
  const thumb = work.userId ? workThumbKeyFor(work.userId, work.id, work.creditPool) : archiveThumbKey(work.outputKey)
  if (work.creditPool === 'free' || (req.size === 'thumb' && (await exists(deps.store, thumb)))) {
    return deps.store.presignGet(thumb, { expiresInSeconds: SIGNED_GET_SECONDS })
  }
  const downloadName = req.download ? `shotviva-${work.id}.png` : undefined
  return deps.store.presignGet(work.outputKey, { expiresInSeconds: SIGNED_GET_SECONDS, downloadName })
}

async function exists(store: ObjectStore, key: string): Promise<boolean> {
  try {
    return (await store.head(key)) !== null
  } catch {
    return false
  }
}
