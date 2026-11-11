import { getImageProps } from 'next/image'

// A template's cover as a generator thumbnail (64 px in the panel's rail, 32 px under its blurred
// fill, 120 px in the preview's inset, 44 px in the picker list): the image optimiser's 1x / 2x
// pair for that width instead of the full-size cover (up to ~150 KB).
export function thumbImage(url: string, px: number): { src: string; srcSet: string | undefined } {
  const { props } = getImageProps({ src: url, alt: '', width: px, height: Math.round(px * 1.25) })
  return { src: props.src, srcSet: props.srcSet }
}
