'use client'

import Image, { getImageProps } from 'next/image'
import type { ComponentProps } from 'react'
import { preconnect, preload } from 'react-dom'

import { presizedSource, type PresizedUrl } from '../presized'
import { publicEnv } from '../public-env'
import { coverLoaderFor, presizedLoader } from './cover-image'
import { Picture } from './picture'
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

// A picture with stored AVIF + WebP copies (core/presized): next/image's attributes for each format
// (getImageProps, so loading and priority are exactly what <Image> would render), the AVIF ones as a
// <picture> source. A preloaded or prioritised one (the hero, the LCP image) gets the <head> preload
// next/image would add, naming the AVIF srcset with type="image/avif" (a browser without AVIF skips
// it and loads the WebP <img>), and no fetch priority beyond what the caller asked for: a high one
// here made desktop first paint ~20 ms later (it competes with what the first paint waits for).
function PresizedImage({ sized, ref, onLoad, ...props }: Props & { sized: PresizedUrl }) {
  const img = capSrcSet(getImageProps({ ...props, loader: presizedLoader(sized, 'webp') }).props, props.sizes)
  const avif = capSrcSet(getImageProps({ ...props, loader: presizedLoader(sized, 'avif') }).props, props.sizes)
  preconnect(presizedLoader(sized).origin)
  if ((props.preload || props.priority) && avif.srcSet) {
    preload(avif.src, { as: 'image', imageSrcSet: avif.srcSet, imageSizes: avif.sizes, type: 'image/avif', ...(props.fetchPriority ? { fetchPriority: props.fetchPriority } : {}) })
  }
  return (
    <Picture avif={avif.srcSet && img.loading !== 'lazy' ? { srcSet: avif.srcSet, sizes: avif.sizes } : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image's own markup, one format per element */}
      <img {...img} alt={props.alt} ref={ref} onLoad={onLoad} />
    </Picture>
  )
}

// next/image for the marketing blocks' pictures. A template cover on the assets base or one of the
// site's public pictures goes through the image CDN when NEXT_PUBLIC_IMAGE_CDN_URL is set (cover-image.ts);
// anything else (public/home pictures, static imports) renders exactly as <Image>. A client
// component because a loader is a function, which a server component cannot hand to <Image>.
export function SiteImage({ alt, ...props }: Props) {
  const sized = presizedSource(props.src, { origin: publicEnv.NEXT_PUBLIC_PRESIZED_IMAGES_URL, assetsBase: publicEnv.NEXT_PUBLIC_ASSETS_BASE_URL })
  if (sized) return <PresizedImage alt={alt} {...props} sized={sized} />
  const loader = coverLoaderFor(props.src)
  if (loader) preconnect(loader.origin)
  const all = loader ? { ...props, loader } : props
  if (cappable(all)) return <CappedImage alt={alt} {...all} />
  return <Image alt={alt} {...all} />
}
