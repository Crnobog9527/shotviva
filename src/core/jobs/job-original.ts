import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { logger } from '../logger'
import { inputPreviewKeyFor, type ObjectStore } from '../storage'
import { findOwnJob } from './job-lookup'
import type { Job } from './job-schema'

// Same short life as the result's signed URL; the page asks the route again on each view.
const SIGNED_GET_SECONDS = 300

export const originalUrlFor = (jobId: string) => `/api/files/${jobId}/original`

// Whether the photo page can show "Original": jobs settled before T32, and edits, have no
// preview. One HEAD on R2; an R2 error reads as missing (logged) rather than breaking the page.
export async function hasInputPreview(store: ObjectStore, job: Pick<Job, 'id' | 'userId'>): Promise<boolean> {
  try {
    return (await store.head(inputPreviewKeyFor(job.userId, job.id))) !== null
  } catch (error) {
    logger.warn('input preview head failed', { jobId: job.id, error })
    return false
  }
}

// The download route for the 768px preview of what the user uploaded (ARCHITECTURE §8,
// T32): owner only, finished jobs only, never watermarked (it is the user's own photo).
export async function resolveJobOriginal(
  deps: { db: SupabaseClient; store: ObjectStore },
  req: { userId: string; jobId: string },
): Promise<string> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded') throw new AppError('NOT_FOUND', 'Not found')
  return deps.store.presignGet(inputPreviewKeyFor(job.userId, job.id), { expiresInSeconds: SIGNED_GET_SECONDS })
}
