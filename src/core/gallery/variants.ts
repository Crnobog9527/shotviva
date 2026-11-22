import 'server-only'

import { logger } from '../logger'
import { galleryImage, shouldWatermark, type ObjectStore } from '../storage'

// The gallery's ready-made copies of a work (ARCHITECTURE §9 第 9 条): one WebP per size the
// gallery asks for, made once when the work is approved, so the image route only reads a small
// file instead of reading the full original, resizing and watermarking on every CDN miss.

// The two sizes the gallery asks for: wall tiles and the work page (1x and 2x of a 375px phone).
export const GALLERY_WIDTHS = [480, 960] as const
export type GalleryWidth = (typeof GALLERY_WIDTHS)[number]

export type VariantSource = { id: string; outputKey: string; creditPool: 'free' | 'paid' }

// The version of what galleryImage draws (size rule, protection, WebP quality), per pool. Bump it
// whenever that changes: copies made before then are simply not found, so each work is rendered
// once more with the new settings and stored under the new key, instead of serving stale bytes.
// Free works moved to the protected copy (storage/protect) on 2026-11-22: 'p1'; their 'v1' copies
// (a small corner mark only) are never read again, only deleted with the work.
const VERSION = { paid: 'v1', free: 'p1' } as const
const ALL_VERSIONS = ['v1', 'p1'] as const
export const galleryVariantVersion = (pool: 'free' | 'paid'): string => VERSION[pool]

// Next to the work's own output in the PRIVATE bucket (§8.3: user works never go in the public
// bucket): outputs/{user_id}/{job_id}.png → outputs/{user_id}/{job_id}-gallery-v1-960.webp. Under
// the owner's outputs/{user_id}/ prefix, so account deletion clears them with everything else.
export function galleryVariantKey(outputKey: string, width: GalleryWidth, version: string): string {
  const dot = outputKey.lastIndexOf('.')
  const stem = dot > outputKey.lastIndexOf('/') ? outputKey.slice(0, dot) : outputKey
  return `${stem}-gallery-${version}-${width}.webp`
}

// The copies a work of this pool is served from.
export function galleryVariantKeysFor(work: Pick<VariantSource, 'outputKey' | 'creditPool'>): string[] {
  return GALLERY_WIDTHS.map((width) => galleryVariantKey(work.outputKey, width, galleryVariantVersion(work.creditPool)))
}

// Every copy a work may have, current or retired, for deleting it.
export function galleryVariantKeys(outputKey: string): string[] {
  return ALL_VERSIONS.flatMap((version) => GALLERY_WIDTHS.map((width) => galleryVariantKey(outputKey, width, version)))
}

// Both sizes from the original, protected when the work was made with free credits (the same
// rule as the download, §6.2). `ready` carries a size already rendered (the image route's fallback),
// so it is not rendered twice. Never throws: a work without its copies is still shown, rendered on
// request, and the route writes them then.
export async function storeGalleryVariants(
  store: Pick<ObjectStore, 'put'>,
  work: VariantSource,
  original: Uint8Array,
  ready: Partial<Record<GalleryWidth, Uint8Array>> = {},
): Promise<boolean> {
  try {
    const mark = shouldWatermark(work.creditPool) ? { jobId: work.id } : null
    const version = galleryVariantVersion(work.creditPool)
    for (const width of GALLERY_WIDTHS) {
      const body = ready[width] ?? (await galleryImage(original, width, mark))
      await store.put(galleryVariantKey(work.outputKey, width, version), body, 'image/webp')
    }
    return true
  } catch (error) {
    logger.warn('gallery.variants_not_written', { jobId: work.id, error })
    return false
  }
}

// At approval: skipped when the copies are already there (a kept or re-approved work), else made
// from the original. Never throws.
export async function writeGalleryVariants(store: Pick<ObjectStore, 'get' | 'head' | 'put'>, work: VariantSource): Promise<boolean> {
  try {
    const present = await Promise.all(galleryVariantKeysFor(work).map((key) => store.head(key)))
    if (present.every((head) => head !== null)) return true
    return await storeGalleryVariants(store, work, await store.get(work.outputKey))
  } catch (error) {
    logger.warn('gallery.variants_not_written', { jobId: work.id, error })
    return false
  }
}

// At rejection or deletion, so nothing outlives the work in the gallery. Best effort: a key that
// will not delete is logged; the route never serves it anyway (it checks the work on every miss).
export async function deleteGalleryVariants(store: Pick<ObjectStore, 'delete'>, work: { id: string; outputKey: string }): Promise<number> {
  const results = await Promise.allSettled(galleryVariantKeys(work.outputKey).map((key) => store.delete(key)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) logger.error('gallery.variants_not_deleted', { jobId: work.id, failed: failed.length, error: failed[0]?.reason })
  return failed.length
}
