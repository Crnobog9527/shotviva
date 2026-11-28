import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { logger } from '../logger'
import { workThumbKeyFor, workTileKeyFor, writeWorkThumb, writeWorkTile, type ObjectStore } from '../storage'
import { findOwnJob } from './job-lookup'
import type { Job } from './job-schema'
import { fileUrlFor } from './job-view'

// Same short life as the full file's signed URL (job-file.ts).
const SIGNED_GET_SECONDS = 300

type Owned = Pick<Job, 'id' | 'userId' | 'creditPool'>

// An R2 error reads as "not there" (logged): the caller then makes the copy or shows the full file.
async function hasThumb(store: ObjectStore, job: Owned): Promise<boolean> {
  try {
    return (await store.head(workThumbKeyFor(job.userId, job.id, job.creditPool))) !== null
  } catch (error) {
    logger.warn('work thumbnail head failed', { jobId: job.id, error })
    return false
  }
}

// A work finished before thumbnails existed, or whose copy failed at settle, gets one the first
// time it is asked for, and so does a free work whose copy predates the protected one (its old
// key is never read). The protection follows the work's own pool, as on the full file.
async function makeThumb(store: ObjectStore, job: Owned, outputKey: string): Promise<boolean> {
  try {
    const bytes = await store.get(outputKey)
    return await writeWorkThumb(store, { userId: job.userId, jobId: job.id, bytes, pool: job.creditPool })
  } catch (error) {
    logger.warn('work thumbnail source not read', { jobId: job.id, error })
    return false
  }
}

// Which small copy: the list copy (480 px), or the tile Photos' grid shows (320 px, 2026-11-28).
export type ThumbSize = 'thumb' | 'tile'
const keyOf = (job: Owned, size: ThumbSize) => (size === 'tile' ? workTileKeyFor : workThumbKeyFor)(job.userId, job.id, job.creditPool)

async function has(store: ObjectStore, job: Owned, size: ThumbSize): Promise<boolean> {
  if (size === 'thumb') return hasThumb(store, job)
  try {
    return (await store.head(keyOf(job, 'tile'))) !== null
  } catch (error) {
    logger.warn('work tile head failed', { jobId: job.id, error })
    return false
  }
}

// The thumbnail route's logic (ARCHITECTURE §8.3「作品小图」). The access rule is the full file's:
// owner only (anyone else gets the same 404 as a missing job), finished jobs only. Answers where
// to redirect: a 5-minute signed URL of the small copy, or, when there is none and none could be
// made, the full-file route, so a list never shows a broken image. A tile is cut from the list
// copy (made first when that is missing too); a tile that cannot be made answers the list copy.
export async function resolveJobThumb(deps: { db: SupabaseClient; store: ObjectStore }, req: { userId: string; jobId: string }, size: ThumbSize = 'thumb'): Promise<string> {
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || !job.outputKey) throw new AppError('NOT_FOUND', 'Not found')
  const which = await copyToServe(deps.store, job, job.outputKey, size)
  return which ? deps.store.presignGet(keyOf(job, which), { expiresInSeconds: SIGNED_GET_SECONDS }) : fileUrlFor(job.id)
}

// Which copy the route answers with, made when missing; null when the work has none and none
// could be made.
async function copyToServe(store: ObjectStore, job: Owned, outputKey: string, size: ThumbSize): Promise<ThumbSize | null> {
  if (size === 'tile' && (await has(store, job, 'tile'))) return 'tile'
  if (!(await hasThumb(store, job)) && !(await makeThumb(store, job, outputKey))) return null
  if (size === 'thumb') return 'thumb'
  return (await writeWorkTile(store, { userId: job.userId, jobId: job.id, pool: job.creditPool })) ? 'tile' : 'thumb'
}

// How many of Photos' newest works get their signed URL written into the page: the first screen
// (two rows of six on a desktop, four rows of three on a phone).
export const FIRST_SCREEN_THUMBS = 12

// Photos' first screen: the signed URL of each of the caller's own newest works that already has
// that small copy (`size`: Photos asks for tiles), so the browser fetches it straight from R2 without first asking the thumbnail
// route (one function run and a redirect per image). `jobs` must be rows already read as their
// owner. One HEAD each, in parallel; anything missing or failing is simply left out and the page
// falls back to the route. Never throws, R2 not being configured included.
export async function firstThumbUrls(store: () => ObjectStore, jobs: readonly Owned[], count = FIRST_SCREEN_THUMBS, size: ThumbSize = 'thumb'): Promise<Map<string, string>> {
  try {
    const r2 = store()
    const signed = await Promise.all(
      jobs.slice(0, count).map(async (job) => {
        if (!(await has(r2, job, size))) return null
        return [job.id, await r2.presignGet(keyOf(job, size), { expiresInSeconds: SIGNED_GET_SECONDS })] as const
      }),
    )
    return new Map(signed.filter((entry) => entry !== null))
  } catch (error) {
    logger.warn('first thumbnails not signed', { error })
    return new Map()
  }
}
