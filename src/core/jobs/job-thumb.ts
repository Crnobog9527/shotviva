import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { logger } from '../logger'
import { shouldWatermark, workThumbKeyFor, writeWorkThumb, type ObjectStore } from '../storage'
import { findOwnJob } from './job-lookup'
import type { Job } from './job-schema'
import { fileUrlFor } from './job-view'

// Same short life as the full file's signed URL (job-file.ts).
const SIGNED_GET_SECONDS = 300

type Owned = Pick<Job, 'id' | 'userId'>

// An R2 error reads as "not there" (logged): the caller then makes the copy or shows the full file.
async function hasThumb(store: ObjectStore, job: Owned): Promise<boolean> {
  try {
    return (await store.head(workThumbKeyFor(job.userId, job.id))) !== null
  } catch (error) {
    logger.warn('work thumbnail head failed', { jobId: job.id, error })
    return false
  }
}

// A work finished before thumbnails existed, or whose copy failed at settle, gets one the first
// time it is asked for. The watermark follows the work's own pool, as on the full file.
async function makeThumb(store: ObjectStore, job: Owned & Pick<Job, 'creditPool'>, outputKey: string): Promise<boolean> {
  try {
    const bytes = await store.get(outputKey)
    return await writeWorkThumb(store, { userId: job.userId, jobId: job.id, bytes, watermark: shouldWatermark(job.creditPool) })
  } catch (error) {
    logger.warn('work thumbnail source not read', { jobId: job.id, error })
    return false
  }
}

// The thumbnail route's logic (ARCHITECTURE §8.3「作品小图」). The access rule is the full file's:
// owner only (anyone else gets the same 404 as a missing job), finished jobs only. Answers where
// to redirect: a 5-minute signed URL of the small copy, or, when there is none and none could be
// made, the full-file route, so a list never shows a broken image.
export async function resolveJobThumb(deps: { db: SupabaseClient; store: ObjectStore }, req: { userId: string; jobId: string }): Promise<string> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey) throw new AppError('NOT_FOUND', 'Not found')
  if ((await hasThumb(deps.store, job)) || (await makeThumb(deps.store, job, job.outputKey))) {
    return deps.store.presignGet(workThumbKeyFor(job.userId, job.id), { expiresInSeconds: SIGNED_GET_SECONDS })
  }
  return fileUrlFor(job.id)
}

// How many of Photos' newest works get their signed URL written into the page: the first screen
// (two rows of four on a desktop, three rows of two on a phone).
export const FIRST_SCREEN_THUMBS = 8

// Photos' first screen: the signed URL of each of the caller's own newest works that already has
// its small copy, so the browser fetches it straight from R2 without first asking the thumbnail
// route (one function run and a redirect per image). `jobs` must be rows already read as their
// owner. One HEAD each, in parallel; anything missing or failing is simply left out and the page
// falls back to the route. Never throws, R2 not being configured included.
export async function firstThumbUrls(store: () => ObjectStore, jobs: readonly Owned[], count = FIRST_SCREEN_THUMBS): Promise<Map<string, string>> {
  try {
    const r2 = store()
    const signed = await Promise.all(
      jobs.slice(0, count).map(async (job) => {
        if (!(await hasThumb(r2, job))) return null
        return [job.id, await r2.presignGet(workThumbKeyFor(job.userId, job.id), { expiresInSeconds: SIGNED_GET_SECONDS })] as const
      }),
    )
    return new Map(signed.filter((entry) => entry !== null))
  } catch (error) {
    logger.warn('first thumbnails not signed', { error })
    return new Map()
  }
}
