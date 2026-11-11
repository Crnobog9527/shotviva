import 'server-only'

import { galleryImage, shouldWatermark, type ObjectStore } from '../storage'
import { shownImage } from './reads'

// The two sizes the gallery asks for: wall tiles and the work page (1x and 2x of a 375px phone).
export const GALLERY_WIDTHS = [480, 960] as const
export type GalleryWidth = (typeof GALLERY_WIDTHS)[number]

// The image route's query must be exactly `w=480` or `w=960`. Anything else is a 404, so no
// one can make the CDN miss (and us read R2 and resize) by varying the query string.
export function parseImageQuery(params: URLSearchParams): GalleryWidth | null {
  const keys = [...params.keys()]
  if (keys.length !== 1 || keys[0] !== 'w') return null
  return GALLERY_WIDTHS.find((width) => String(width) === params.get('w')) ?? null
}

// The image route's body: null for any work the gallery does not show (the route answers 404).
// The original is read from the private bucket and never leaves it as is.
export async function renderGalleryImage(store: Pick<ObjectStore, 'get'>, id: string, width: GalleryWidth): Promise<Uint8Array | null> {
  const shown = await shownImage(id)
  if (!shown) return null
  const original = await store.get(shown.outputKey).catch((error: unknown) => {
    // A file already gone (the work is being deleted) is a 404, not a server error.
    if (error instanceof Error && error.name === 'NoSuchKey') return null
    throw error
  })
  return original ? galleryImage(original, width, shouldWatermark(shown.creditPool)) : null
}

// Where a page points an <img>; ?w= picks the size.
export function galleryImagePath(id: string, width: GalleryWidth): string {
  return `/api/gallery/${id}/image?w=${width}`
}
