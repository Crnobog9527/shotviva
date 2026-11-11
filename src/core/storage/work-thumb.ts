import 'server-only'

import { logger } from '../logger'
import { workThumbKeyFor } from './keys'
import type { ObjectStore } from './object-store'
import { workThumbImage } from './watermark'

// ARCHITECTURE §8.3「作品小图」: lists show this instead of the full output (a 1K PNG is about
// 1MB, a 2K one over 5MB; this is about 20KB). 480 on the short edge fills a Photos tile on a
// 3x phone and a four-column desktop tile.
export const WORK_THUMB_PX = 480

// The bytes behind a key never change, so the owner's browser may keep them; never a shared cache.
const CACHE_CONTROL = 'private, max-age=31536000, immutable'

// Never throws: a work without its small copy is shown from the full file (job-thumb.ts), which
// must not turn a finished, paid result into an error.
export async function writeWorkThumb(store: Pick<ObjectStore, 'put'>, input: { userId: string; jobId: string; bytes: Uint8Array; watermark: boolean }): Promise<boolean> {
  try {
    const thumb = await workThumbImage(input.bytes, WORK_THUMB_PX, input.watermark)
    await store.put(workThumbKeyFor(input.userId, input.jobId), thumb, 'image/webp', { cacheControl: CACHE_CONTROL })
    return true
  } catch (error) {
    logger.warn('work thumbnail not written', { jobId: input.jobId, error })
    return false
  }
}
