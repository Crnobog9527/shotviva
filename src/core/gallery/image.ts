import 'server-only'

import { galleryImage, shouldWatermark, type ObjectStore } from '../storage'
import { logger } from '../logger'
import { shownImage } from './reads'
import { GALLERY_WIDTHS, galleryVariantKey, galleryVariantVersion, storeGalleryVariants, type GalleryWidth, type VariantSource } from './variants'

export { GALLERY_WIDTHS, type GalleryWidth } from './variants'

// The image route's query must be exactly `w=480` or `w=960`. Anything else is a 404, so no
// one can make the CDN miss (and us read R2) by varying the query string.
export function parseImageQuery(params: URLSearchParams): GalleryWidth | null {
  const keys = [...params.keys()]
  if (keys.length !== 1 || keys[0] !== 'w') return null
  return GALLERY_WIDTHS.find((width) => String(width) === params.get('w')) ?? null
}

const isMissing = (error: unknown) => error instanceof Error && error.name === 'NoSuchKey'

// The ready-made copy, or null when it is not there (an older work, a failed write). Any other
// read error is logged and also falls back: rendering is slower but still right.
async function readVariant(store: Pick<ObjectStore, 'get'>, key: string, jobId: string): Promise<Uint8Array | null> {
  try {
    return await store.get(key)
  } catch (error) {
    if (!isMissing(error)) logger.warn('gallery.variant_read_failed', { jobId, error })
    return null
  }
}

export type ImageDeps = {
  store: Pick<ObjectStore, 'get' | 'put'>
  // Runs a task after the response (the route passes next/server's after).
  defer: (task: () => Promise<unknown>) => void
}

// A work whose picture a public page may show. The caller has already decided that it may.
export type ServedWork = VariantSource

// THE way a public page gets a work's picture (the gallery, the share pages): `width` wide,
// WebP; a free work's copy is protected (storage/protect: long edge ≤ 1080, the visible marks,
// the tracking mark), a paid work's is a clean resize. Normally the copy stored for that pool's
// version (variants.ts), read as is. Without one, today's render from the original, and both
// sizes are written after the response for the next miss, once `stillShown` (if given) confirms
// the work is still shown, so a copy does not outlive its approval. The original never leaves the
// private bucket as is. null when the original is already gone (a work being deleted).
export async function servedWorkImage(
  deps: ImageDeps,
  work: ServedWork,
  width: GalleryWidth,
  stillShown: () => Promise<boolean> = async () => true,
): Promise<Uint8Array | null> {
  const stored = await readVariant(deps.store, galleryVariantKey(work.outputKey, width, galleryVariantVersion(work.creditPool)), work.id)
  if (stored) return stored
  const original = await deps.store.get(work.outputKey).catch((error: unknown) => {
    // A file already gone (the work is being deleted) is a 404, not a server error.
    if (isMissing(error)) return null
    throw error
  })
  if (!original) return null
  const body = await galleryImage(original, width, shouldWatermark(work.creditPool) ? { jobId: work.id } : null)
  deps.defer(async () => {
    if (await stillShown()) await storeGalleryVariants(deps.store, work, original, { [width]: body })
  })
  return body
}

// The image route's body, once the route knows the gallery is open: null for any work the gallery
// does not show (the route answers 404).
export async function renderGalleryImage(deps: ImageDeps, id: string, width: GalleryWidth): Promise<Uint8Array | null> {
  const shown = await shownImage(id)
  if (!shown) return null
  return servedWorkImage(deps, { id, ...shown }, width, async () => (await shownImage(id)) !== null)
}

// Where a page points an <img>; ?w= picks the size.
export function galleryImagePath(id: string, width: GalleryWidth): string {
  return `/api/gallery/${id}/image?w=${width}`
}
