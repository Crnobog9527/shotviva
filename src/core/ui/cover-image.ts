import { getImageProps, type ImageLoader } from 'next/image'
import { preconnect } from 'react-dom'

import { publicEnv } from '../public-env'
import { capSrcSet } from './srcset-cap'

// A template cover at the size it is shown: the image optimiser's srcset for the slot `sizes`
// describes (AVIF / WebP, next.config.ts) instead of the stored file, which is up to 1600 px on
// its long edge (ARCHITECTURE §8.3) and 40–450 KB, for a plate that is often under 200 px wide.
// The caller keeps its own <img> and classes, so nothing on screen changes. Only covers on the
// assets base (images.remotePatterns) are rewritten: a user's photo on an auth-gated route or a
// blob: preview passes through as given.
//
// With NEXT_PUBLIC_IMAGE_CDN_URL set (the image CDN switch, core/public-env-schema.ts) the same
// optimiser URLs are put on the CDN's host instead: the CDN forwards /_next/image?… to this site
// and caches what it returns, so the files are byte for byte the ones served today. Nothing in
// the database changes; unsetting the variable and redeploying turns it off.

export type CoverImage = { sizes?: string; srcSet?: string; src: string }

export function isCoverUrl(url: string, base: string | undefined = publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL): boolean {
  return Boolean(base) && url.startsWith(`${base}/`)
}

// Keys in the order next/image renders them (sizes, srcSet, src), so the browser has the
// srcset before it could start fetching src.
export function coverImage(url: string, sizes: string, base?: string, cdn: string | undefined = publicEnv.NEXT_PUBLIC_IMAGE_CDN_URL): CoverImage {
  if (!isCoverUrl(url, base)) return { src: url }
  // The CDN is a new origin for the page: start its DNS + TLS while the HTML is still arriving
  // (React hoists this into <head>; repeated calls collapse into one link).
  if (cdn) preconnect(cdn)
  const { props } = getImageProps({ src: url, alt: '', fill: true, sizes, ...(cdn ? { loader: cdnLoader(cdn) } : {}) })
  // Without the candidates no screen up to 2× picks (srcset-cap.ts).
  return capSrcSet({ sizes: props.sizes, srcSet: props.srcSet, src: props.src }, sizes)
}

// Next's own default-loader URL (url, w, q in that order; covers are remote, so no dpl), on the
// CDN's host. The optimiser validates url against images.remotePatterns exactly as before.
export function cdnLoader(cdn: string): ImageLoader & { origin: string } {
  const loader: ImageLoader = ({ src, width, quality }) => `${cdn}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`
  return Object.assign(loader, { origin: cdn })
}

// The site's own pictures in public/ (marketing heroes, cases, intros…), which /_next/image also
// serves. Never /api/… (signed-in users' photos) or anything else on this host.
const PUBLIC_PICTURE_DIRS = ['/home/', '/cases/', '/intros/', '/partners/', '/brand/', '/og/', '/icons/']
export const isPublicPicture = (src: string) => PUBLIC_PICTURE_DIRS.some((dir) => src.startsWith(dir))

// The CDN loader for a next/image src that is a cover or one of the site's public pictures, or
// undefined (switch off, a static import, a user's photo, another host).
export function coverLoaderFor(src: unknown, base?: string, cdn: string | undefined = publicEnv.NEXT_PUBLIC_IMAGE_CDN_URL) {
  return cdn && typeof src === 'string' && (isCoverUrl(src, base) || isPublicPicture(src)) ? cdnLoader(cdn) : undefined
}

// One optimised URL at least `width` px wide, for the places that take no srcset (a <video>
// poster). The stored file when it is not a cover.
export function coverSrc(url: string, width: number, base?: string, cdn?: string): string {
  const { srcSet, src } = coverImage(url, `${width}px`, base, ...(cdn === undefined ? [] : [cdn]))
  const candidates = (srcSet ?? '').split(', ').map((entry) => {
    const [href = '', descriptor = ''] = entry.split(' ')
    return { href, width: Number.parseInt(descriptor, 10) }
  })
  return candidates.find((candidate) => candidate.width >= width)?.href ?? src
}
