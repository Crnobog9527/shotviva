// Pre-sized pictures: a fixed set of WebP widths stored next to each public picture, so the image
// CDN serves plain files instead of /_next/image (whose answer depends on the browser's Accept
// header, so EdgeOne kept one copy per width per Accept string and missed far more often). Pure:
// the pages, next.config.ts, the storage wrapper and the backfill script all read it.

// The widths stored for every picture, and the widths next/image may ask for (next.config.ts
// imageSizes + deviceSizes), so its srcset names only files that exist. Next's defaults minus the
// tiny 32–96 (those slots take 128) and the 1920–3840 a cover never has (1600 is its long edge,
// cover-rules.ts COVER_STILL_EDGE); every slot ≥ 128 px picks the same width as before.
export const PRESIZED_WIDTHS = [128, 256, 384, 640, 750, 828, 1080, 1200, 1600] as const
export type PresizedWidth = (typeof PRESIZED_WIDTHS)[number]

// next/image's two lists: imageSizes must all be below the first device size.
export const PRESIZED_IMAGE_SIZES = PRESIZED_WIDTHS.filter((width) => width < 640)
export const PRESIZED_DEVICE_SIZES = PRESIZED_WIDTHS.filter((width) => width >= 640)

// Each width in both formats /_next/image answered with: AVIF for the browsers that take it (a
// <picture> source), WebP for the rest (the <img>). The format is in the file name, so the CDN still
// keeps one object per URL whatever the Accept header says. The encoder settings are the
// optimiser's (quality 75; AVIF at its webp-matched 47, effort 3), so a file is the bytes that
// browser got before. Bump the version whenever the encoding changes: the new files get new names
// and the old ones, cached for a year, are never asked for again.
export const PRESIZED_FORMATS = ['avif', 'webp'] as const
export type PresizedFormat = (typeof PRESIZED_FORMATS)[number]
export const PRESIZED_QUALITY = 75
export const PRESIZED_VERSION = 'v1'
export const PRESIZED_PREFIX = `presized/${PRESIZED_VERSION}`

// The smallest stored width at least `width` wide (next/image only asks for listed widths; this
// keeps any other request on a file that exists).
export function presizedWidthFor(width: number): PresizedWidth {
  return PRESIZED_WIDTHS.find((candidate) => candidate >= width) ?? PRESIZED_WIDTHS[PRESIZED_WIDTHS.length - 1]
}

// `covers/x/after-ab.webp` → `presized/v1/w640/covers/x/after-ab.avif` (or .webp).
export function presizedPath(path: string, width: number, format: PresizedFormat = 'webp'): string {
  return `${PRESIZED_PREFIX}/w${presizedWidthFor(width)}/${path.replace(/\.[A-Za-z0-9]+$/, '')}.${format}`
}

// Every file a picture has: each width in each format.
export function presizedPaths(path: string): string[] {
  return PRESIZED_WIDTHS.flatMap((width) => PRESIZED_FORMATS.map((format) => presizedPath(path, width, format)))
}

// The cover files that get pre-sized copies: stills whose name carries their content hash (the
// admin publisher's slot + 16 hex, the preview → production sync's 64 hex; still-cover-key.ts),
// so a name never points at other bytes and its copies can be cached forever. Motion files
// (motion-…, .mp4, .gif) are played as they are.
const COVER_KEY = /^covers\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:(?:before|after|poster)-[0-9a-f]{16}\.webp|sync-[0-9a-f]{64}\.(?:webp|jpg|png))$/

export function isPresizableCoverKey(key: string): boolean {
  return COVER_KEY.test(key)
}

// The site's own pictures in public/ that the build pre-sizes (scripts/build/presize-public.mjs
// reads the same list). /brand, /og and /icons stay on /_next/image: few, small, rarely shown.
export const PRESIZED_PUBLIC_DIRS = ['home', 'cases', 'intros', 'partners'] as const
const PUBLIC_PICTURE = new RegExp(`^/(?:${PRESIZED_PUBLIC_DIRS.join('|')})/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g)$`)

export function isPresizablePublicPicture(src: string): boolean {
  return PUBLIC_PICTURE.test(src) && !src.includes('..')
}
