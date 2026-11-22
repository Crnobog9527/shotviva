import 'server-only'

import type { RpcClient } from '../billing/rpc'
import { AppError } from '../errors'
import { logger } from '../logger'
import { applyWatermark, downloadVariantKeyFor, inputPreviewKeyFor, shouldWatermark, stageVariant, type ObjectStore } from '../storage'
import type { SharedItem, WorkShare } from './share-schema'
import { readWorkShare } from './share-store'

// The images of a shared collection (ARCHITECTURE §6.2「作品集分享」). The page only ever points at
// /api/s/w/<share>/<job>/{after,before}; those routes check the link here on every request and
// answer with a 302 to a 5-minute signed URL, as the owner's own file routes do, so no storage
// address is in the page and a revoked link stops serving within minutes. No image bytes pass
// the function (AGENTS §6).

const SIGNED_GET_SECONDS = 300

export type ShareImageSide = 'after' | 'before'
export const isShareImageSide = (value: string): value is ShareImageSide => value === 'after' || value === 'before'

type Deps = { db: RpcClient; store: ObjectStore }

// The result as anyone but its owner may see it. A free work is never served clean: it is the
// same marked JPEG the owner's display and 白底 download give (job-file.ts), staged once under
// the work's own download key (deleted with the work, §8.3) and then signed. A paid work is the
// clean file. The free-work protection rebuild swaps the marked copy here and nowhere else.
async function protectedResultKey(store: ObjectStore, ownerId: string, item: SharedItem): Promise<string> {
  if (!shouldWatermark(item.creditPool)) return item.outputKey
  const key = downloadVariantKeyFor(ownerId, item.jobId, 'marked-white')
  await stageVariant(store, { sourceKey: item.outputKey, key, contentType: 'image/jpeg', make: (source) => applyWatermark(source) })
  return key
}

// The photo the work was made from: the 768px, metadata-free preview (T32), never the upload
// itself. Only when the sharer opted in for this link; a work without one (made before T32, an
// edit, a preview that failed) has none to show.
const beforeKeyOf = (share: WorkShare, item: SharedItem) => inputPreviewKeyFor(share.ownerId, item.jobId)

// Where the route redirects: someone else's job, a deleted work, a revoked link, a before the
// sharer did not opt into, and a missing before all answer the same 404.
export async function sharedImageUrl(deps: Deps, req: { shareId: string; jobId: string; side: ShareImageSide }): Promise<string> {
  const share = await readWorkShare(deps.db, req.shareId)
  const item = share?.items.find((entry) => entry.jobId === req.jobId)
  if (!share || !item) throw new AppError('NOT_FOUND', 'Not found')
  if (req.side === 'after') {
    return deps.store.presignGet(await protectedResultKey(deps.store, share.ownerId, item), { expiresInSeconds: SIGNED_GET_SECONDS })
  }
  if (!share.showBefore) throw new AppError('NOT_FOUND', 'Not found')
  const key = beforeKeyOf(share, item)
  if (!(await deps.store.head(key))) throw new AppError('NOT_FOUND', 'Not found')
  return deps.store.presignGet(key, { expiresInSeconds: SIGNED_GET_SECONDS })
}

// Which works of an opted-in link still have their before photo, so the page shows a comparison
// only where there is one and the after alone elsewhere. One HEAD each, in parallel; an R2 error
// reads as missing (logged), never as a broken page.
export async function worksWithBefore(store: ObjectStore, share: WorkShare): Promise<Set<string>> {
  if (!share.showBefore) return new Set()
  const found = await Promise.all(
    share.items.map(async (item) => {
      try {
        return (await store.head(beforeKeyOf(share, item))) ? item.jobId : null
      } catch (error) {
        logger.warn('work_share.before_head_failed', { jobId: item.jobId, error })
        return null
      }
    }),
  )
  return new Set(found.filter((id): id is string => id !== null))
}

export const sharedImagePath = (shareId: string, jobId: string, side: ShareImageSide) => `/api/s/w/${shareId}/${jobId}/${side}`
