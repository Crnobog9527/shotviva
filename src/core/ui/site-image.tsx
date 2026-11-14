'use client'

import Image from 'next/image'
import type { ComponentProps } from 'react'
import { preconnect } from 'react-dom'

import { coverLoaderFor } from './cover-image'

// next/image for the marketing blocks' pictures. A template cover on the assets base or one of the
// site's public pictures goes through the image CDN when NEXT_PUBLIC_IMAGE_CDN_URL is set (cover-image.ts);
// anything else (public/home pictures, static imports) renders exactly as <Image>. A client
// component because a loader is a function, which a server component cannot hand to <Image>.
export function SiteImage({ alt, ...props }: ComponentProps<typeof Image>) {
  const loader = coverLoaderFor(props.src)
  if (!loader) return <Image alt={alt} {...props} />
  preconnect(loader.origin)
  return <Image alt={alt} {...props} loader={loader} />
}
