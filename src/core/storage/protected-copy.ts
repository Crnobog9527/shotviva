import 'server-only'

import { protectedCopyKeyFor } from './keys'
import type { ObjectStore } from './object-store'
import { stageVariant } from './stage-variant'
import { applyWatermark } from './watermark'

// THE protected copy of a free work, for any server path that hands a free work's full picture
// to a browser or a partner by link (the partner API, the share pages): the R2 key of its
// protected JPEG (storage/protect: long edge ≤ 1080, the visible marks, the tracking mark with the
// work's id). Made from the stored original on first use, then reused; kept under the owner's
// outputs/ prefix for as long as the work (no 7-day lifecycle, so a 7-day link outlives nothing),
// and deleted with it (jobs/kept-inputs.ts workFileKeys). Sign the key you get; never sign the
// work's outputKey for a free work. A paid work has no protected copy: use its outputKey.
export async function protectedWorkCopy(store: ObjectStore, work: { id: string; userId: string; outputKey: string }): Promise<string> {
  const key = protectedCopyKeyFor(work.userId, work.id)
  await stageVariant(store, { sourceKey: work.outputKey, key, contentType: 'image/jpeg', make: (source) => applyWatermark(source, { jobId: work.id }) })
  return key
}
