'use client'

import Image, { getImageProps } from 'next/image'
import type { ComponentProps } from 'react'
import { preconnect } from 'react-dom'

import { coverLoaderFor } from './cover-image'
import { capSrcSet, slotMaxPx } from './srcset-cap'

type Props = ComponentProps<typeof Image>

// A picture whose srcset can be shortened (srcset-cap.ts): its `sizes` bounds the slot, and it is
// a plain lazy or eager picture. The preloaded and prioritised ones (heroes, the LCP image) keep
// next/image, whose <head> preload must name the same srcset as the <img>.
function cappable(props: Omit<Props, 'alt'>): boolean {
  const { sizes, preload, priority, fetchPriority, placeholder } = props
  return typeof sizes === 'string' && slotMaxPx(sizes) !== null && !preload && !priority && !fetchPriority && (!placeholder || placeholder === 'empty')
}

// The <img> next/image would render (getImageProps: same attributes, same order, same loader),
// minus the srcset candidates no screen up to 2× picks. onLoad is passed straight through: unlike
// <Image>, nothing replays it for a picture that loaded before hydration, so a caller that needs
// that checks `complete` on its ref (use-loaded.ts does).
function CappedImage({ ref, onLoad, ...props }: Props) {
  const { props: img } = getImageProps(props)
  // eslint-disable-next-line @next/next/no-img-element -- next/image's own markup, srcset shortened
  return <img {...capSrcSet(img, props.sizes)} alt={props.alt} ref={ref} onLoad={onLoad} />
}

// next/image for the marketing blocks' pictures. A template cover on the assets base or one of the
// site's public pictures goes through the image CDN when NEXT_PUBLIC_IMAGE_CDN_URL is set (cover-image.ts);
// anything else (public/home pictures, static imports) renders exactly as <Image>. A client
// component because a loader is a function, which a server component cannot hand to <Image>.
export function SiteImage({ alt, ...props }: Props) {
  const loader = coverLoaderFor(props.src)
  if (loader) preconnect(loader.origin)
  const all = loader ? { ...props, loader } : props
  if (cappable(all)) return <CappedImage alt={alt} {...all} />
  return <Image alt={alt} {...all} />
}
