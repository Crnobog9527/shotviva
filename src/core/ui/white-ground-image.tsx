'use client'

import { type ImageProps } from 'next/image'

import { cn } from './cn'
import { SiteImage as Image } from './site-image'
import { useLoaded } from './use-loaded'

// next/image with solid white painted behind its own pixels once it has loaded, so a template's
// transparent "after" cover (a cut-out on a white-background template) reads as white instead of
// showing whatever sits under it (the phone photo of the pair, the page). Opaque covers hide it.
export function WhiteGroundImage({ alt, className, onLoad, ...props }: ImageProps) {
  const { loaded, ref, onLoad: markLoaded } = useLoaded()
  return (
    <Image
      {...props}
      alt={alt}
      ref={ref}
      onLoad={(event) => {
        markLoaded()
        onLoad?.(event)
      }}
      className={cn(className, loaded && 'bg-photo-white')}
    />
  )
}
