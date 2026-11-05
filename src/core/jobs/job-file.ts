import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { applyWatermark, shouldWatermark, type ObjectStore } from '../storage'
import { findOwnJob } from './job-lookup'

export type JobFile =
  // Clean output: the browser fetches it straight from R2, so no bytes pass the function.
  | { kind: 'redirect'; url: string }
  // Free work: watermarked here (ARCHITECTURE §6.2), JPEG so it stays well under 4.5MB.
  | { kind: 'bytes'; body: Uint8Array; contentType: 'image/jpeg'; filename: string }

// Short: the URL is minted per request, so a revoked share never outlives it for long.
const SIGNED_GET_SECONDS = 300

// The download route's logic: owner only (anyone else gets the same 404 as a missing job),
// finished jobs only, and the watermark decided by the work's own credit_pool: a free work
// stays marked after its owner pays, a paid work stays clean after the membership ends.
export async function resolveJobFile(
  deps: { db: SupabaseClient; store: ObjectStore },
  req: { userId: string; jobId: string; download: boolean },
): Promise<JobFile> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey) throw new AppError('NOT_FOUND', 'Not found')

  if (!shouldWatermark(job.creditPool)) {
    const url = await deps.store.presignGet(job.outputKey, {
      expiresInSeconds: SIGNED_GET_SECONDS,
      downloadName: req.download ? `shotviva-${job.id}.png` : undefined,
    })
    return { kind: 'redirect', url }
  }
  const body = await applyWatermark(await deps.store.get(job.outputKey))
  return { kind: 'bytes', body, contentType: 'image/jpeg', filename: `shotviva-${job.id}.jpg` }
}
