import 'server-only'

import { galleryImage, shouldWatermark, type ObjectStore } from '../storage'
import { logger } from '../logger'
import { shownImage } from './reads'
import { GALLERY_WIDTHS, galleryVariantKey, storeGalleryVariants, type GalleryWidth } from './variants'

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
  // Whether the gallery is open (isGalleryEnabled), asked alongside the work, not before it: on
  // a cold instance each is a database round trip from the function's region.
  isOpen: () => Promise<boolean>
  // Runs a task after the response (the route passes next/server's after).
  defer: (task: () => Promise<unknown>) => void
}

// The image route's body: 'closed' while the gallery is closed and null for any work it does not
// show (the route answers 404 to both; only the second may sit in the CDN for a minute).
// Normally the copy made at approval (variants.ts), read as is. Without one, today's render from
// the original, and both copies are written after the response for the next miss. The original
// never leaves the private bucket as is.
export async function renderGalleryImage(deps: ImageDeps, id: string, width: GalleryWidth): Promise<Uint8Array | null | 'closed'> {
  const [open, shown] = await Promise.all([deps.isOpen(), shownImage(id)])
  if (!open) return 'closed'
  if (!shown) return null
  const stored = await readVariant(deps.store, galleryVariantKey(shown.outputKey, width), id)
  if (stored) return stored
  const original = await deps.store.get(shown.outputKey).catch((error: unknown) => {
    // A file already gone (the work is being deleted) is a 404, not a server error.
    if (isMissing(error)) return null
    throw error
  })
  if (!original) return null
  const body = await galleryImage(original, width, shouldWatermark(shown.creditPool))
  deps.defer(() => storeGalleryVariants(deps.store, { id, ...shown }, original, { [width]: body }))
  return body
}

// Where a page points an <img>; ?w= picks the size.
export function galleryImagePath(id: string, width: GalleryWidth): string {
  return `/api/gallery/${id}/image?w=${width}`
}
