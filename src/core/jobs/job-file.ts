import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { isPaid } from '../billing'
import { AppError } from '../errors'
import { applyWatermark, shouldWatermark, type ObjectStore } from '../storage'
import { findOwnJob } from './job-lookup'

export type JobFile =
  // Clean output: the browser fetches it straight from R2, so no bytes pass the function.
  | { kind: 'redirect'; url: string }
  // Free public work: watermarked here (ARCHITECTURE §6.2), JPEG so it stays well under 4.5MB.
  | { kind: 'bytes'; body: Uint8Array; contentType: 'image/jpeg'; filename: string }

// Short: the URL is minted per request and paid status can change at any time.
const SIGNED_GET_SECONDS = 300

// The download route's logic: owner only (anyone else gets the same 404 as a missing job),
// finished jobs only, and the watermark decided by the owner's paid status *now*, so buying
// a pass removes the mark from old public works without reprocessing.
export async function resolveJobFile(
  deps: { db: SupabaseClient; store: ObjectStore },
  req: { userId: string; jobId: string; download: boolean },
): Promise<JobFile> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey) throw new AppError('NOT_FOUND', 'Not found')

  const paid = await isPaid(deps.db, req.userId)
  if (!shouldWatermark(job.visibility, paid)) {
    const url = await deps.store.presignGet(job.outputKey, {
      expiresInSeconds: SIGNED_GET_SECONDS,
      downloadName: req.download ? `shotviva-${job.id}.png` : undefined,
    })
    return { kind: 'redirect', url }
  }
  const body = await applyWatermark(await deps.store.get(job.outputKey))
  return { kind: 'bytes', body, contentType: 'image/jpeg', filename: `shotviva-${job.id}.jpg` }
}
