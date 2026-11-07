import { getImageProps } from 'next/image'

import { publicEnv } from '../public-env'

// A template cover at the size it is shown: the image optimiser's srcset for the slot `sizes`
// describes (AVIF / WebP, next.config.ts) instead of the stored file, which is up to 1600 px on
// its long edge (ARCHITECTURE §8.3) and 40–450 KB, for a plate that is often under 200 px wide.
// The caller keeps its own <img> and classes, so nothing on screen changes. Only covers on the
// assets base (images.remotePatterns) are rewritten: a user's photo on an auth-gated route or a
// blob: preview passes through as given.

export type CoverImage = { sizes?: string; srcSet?: string; src: string }

export function isCoverUrl(url: string, base: string | undefined = publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL): boolean {
  return Boolean(base) && url.startsWith(`${base}/`)
}

// Keys in the order next/image renders them (sizes, srcSet, src), so the browser has the
// srcset before it could start fetching src.
export function coverImage(url: string, sizes: string, base?: string): CoverImage {
  if (!isCoverUrl(url, base)) return { src: url }
  const { props } = getImageProps({ src: url, alt: '', fill: true, sizes })
  return { sizes: props.sizes, srcSet: props.srcSet, src: props.src }
}

// One optimised URL at least `width` px wide, for the places that take no srcset (a <video>
// poster). The stored file when it is not a cover.
export function coverSrc(url: string, width: number, base?: string): string {
  const { srcSet, src } = coverImage(url, `${width}px`, base)
  const candidates = (srcSet ?? '').split(', ').map((entry) => {
    const [href = '', descriptor = ''] = entry.split(' ')
    return { href, width: Number.parseInt(descriptor, 10) }
  })
  return candidates.find((candidate) => candidate.width >= width)?.href ?? src
}
