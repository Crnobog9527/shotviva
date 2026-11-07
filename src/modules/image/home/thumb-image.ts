import { getImageProps } from 'next/image'

// A template's cover as a generator thumbnail (44 px in the card, the bench chip and the picker
// list, 84 px in the rail): the image optimiser's 1x / 2x pair for that width instead of the
// full-size cover, about 150 KB, which the card used to fetch before the first paint. The <img>
// and its CSS box stay the same, so nothing on screen changes.
export function thumbImage(url: string, px: number): { src: string; srcSet: string | undefined } {
  const { props } = getImageProps({ src: url, alt: '', width: px, height: Math.round(px * 1.25) })
  return { src: props.src, srcSet: props.srcSet }
}
