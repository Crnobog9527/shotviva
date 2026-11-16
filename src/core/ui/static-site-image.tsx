import { getImageProps, type ImageProps } from 'next/image'
import { preconnect } from 'react-dom'

import { coverLoaderFor } from './cover-image'
import { capSrcSet, slotMaxPx } from './srcset-cap'

type Props = Omit<ImageProps, 'onLoad' | 'onError' | 'ref' | 'preload' | 'priority' | 'fetchPriority' | 'placeholder'>

// Static marketing images need no client boundary or hydration. Keep the same loader and
// responsive candidates as SiteImage, including the CDN preconnect when it is configured.
export function StaticSiteImage(props: Props) {
  const loader = coverLoaderFor(props.src)
  if (loader) preconnect(loader.origin)
  const { props: image } = getImageProps(loader ? { ...props, loader } : props)
  const capped = typeof props.sizes === 'string' && slotMaxPx(props.sizes) !== null
    ? capSrcSet(image, props.sizes)
    : image
  // eslint-disable-next-line @next/next/no-img-element -- getImageProps supplies Next's optimized attributes
  return <img {...capped} alt={props.alt} />
}
