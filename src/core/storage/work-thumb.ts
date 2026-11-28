import 'server-only'

import { logger } from '../logger'
import { workThumbKeyFor, workTileKeyFor } from './keys'
import type { ObjectStore } from './object-store'
import { shouldWatermark, workThumbImage, workTileFromThumb } from './watermark'

// ARCHITECTURE §8.3「作品小图」: lists show this instead of the full output (a 1K PNG is about
// 1MB, a 2K one over 5MB; this is about 20KB). 480 on the short edge fills a Photos tile on a
// 3x phone and a four-column desktop tile.
export const WORK_THUMB_PX = 480
// Photos' grid is three tiles across a phone and six across a desktop since 2026-11-28: a tile is
// 110-180 CSS px wide, and nine 480 px copies on one slow line pushed the first screen back by
// seconds (#998). 320 on the short edge is under half the bytes and still fills a 2x tile.
export const WORK_TILE_PX = 320

// The bytes behind a key never change, so the owner's browser may keep them; never a shared cache.
const CACHE_CONTROL = 'private, max-age=31536000, immutable'

// Never throws: a work without its small copy is shown from the full file (job-thumb.ts), which
// must not turn a finished, paid result into an error.
// pool: the work's credit_pool; a free work's copy is the protected one, under its own key.
export async function writeWorkThumb(store: Pick<ObjectStore, 'put'>, input: { userId: string; jobId: string; bytes: Uint8Array; pool: 'free' | 'paid' }): Promise<boolean> {
  try {
    const thumb = await workThumbImage(input.bytes, WORK_THUMB_PX, shouldWatermark(input.pool) ? { jobId: input.jobId } : null)
    await store.put(workThumbKeyFor(input.userId, input.jobId, input.pool), thumb, 'image/webp', { cacheControl: CACHE_CONTROL })
    return true
  } catch (error) {
    logger.warn('work thumbnail not written', { jobId: input.jobId, error })
    return false
  }
}

type Copy = { userId: string; jobId: string; pool: 'free' | 'paid' }

// The list copy and the tile copy of a new work, the tile cut from the list copy (one decode of
// the full output, and the tile inherits a free work's protection). Never throws.
export async function writeWorkCopies(store: Pick<ObjectStore, 'put'>, input: Copy & { bytes: Uint8Array }): Promise<boolean> {
  try {
    const thumb = await workThumbImage(input.bytes, WORK_THUMB_PX, shouldWatermark(input.pool) ? { jobId: input.jobId } : null)
    await Promise.all([
      store.put(workThumbKeyFor(input.userId, input.jobId, input.pool), thumb, 'image/webp', { cacheControl: CACHE_CONTROL }),
      putTile(store, input, thumb),
    ])
    return true
  } catch (error) {
    logger.warn('work copies not written', { jobId: input.jobId, error })
    return false
  }
}

// The tile copy of a work whose list copy exists: read that (tens of KB), never the full output.
// Never throws.
export async function writeWorkTile(store: Pick<ObjectStore, 'put' | 'get'>, input: Copy): Promise<boolean> {
  try {
    await putTile(store, input, await store.get(workThumbKeyFor(input.userId, input.jobId, input.pool)))
    return true
  } catch (error) {
    logger.warn('work tile not written', { jobId: input.jobId, error })
    return false
  }
}

async function putTile(store: Pick<ObjectStore, 'put'>, input: Copy, thumb: Uint8Array): Promise<void> {
  await store.put(workTileKeyFor(input.userId, input.jobId, input.pool), await workTileFromThumb(thumb, WORK_TILE_PX), 'image/webp', { cacheControl: CACHE_CONTROL })
}
