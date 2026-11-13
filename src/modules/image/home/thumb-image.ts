import { getImageProps } from 'next/image'

import { coverLoaderFor } from '@/core/ui/cover-image'

// A template's cover as a generator thumbnail (64 px in the panel's rail, 32 px under its blurred
// fill, 120 px in the preview's inset, 44 px in the picker list): the image optimiser's 1x / 2x
// pair for that width instead of the full-size cover (up to ~150 KB). Width and height go on the
// <img> too (SEO patch v5 item 4): the CSS sizes every one of these boxes, so they never move it.
export function thumbImage(url: string, px: number): { src: string; srcSet: string | undefined; width: number; height: number } {
  const height = Math.round(px * 1.25)
  const { props } = getImageProps({ src: url, alt: '', width: px, height , loader: coverLoaderFor(url) })
  return { src: props.src, srcSet: props.srcSet, width: px, height }
}
