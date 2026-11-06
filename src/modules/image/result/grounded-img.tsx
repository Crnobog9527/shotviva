'use client'

/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import { useCallback, useState, type ComponentProps } from 'react'

import { cn } from '@/core/ui/cn'

export type PhotoGround = 'white' | 'checker'

const GROUND_CLASS: Record<PhotoGround, string> = { white: 'bg-photo-white', checker: 'checker-ground' }

// A result photo with a ground painted behind its own pixels, so a transparent PNG reads as
// a cut-out on white (or on a checkerboard) instead of on the dark UI or on whatever sits
// under it. The ground appears only once the image has loaded: a white box flashing on the
// dark app while a photo loads would read as a broken image. Opaque photos cover it fully.
export function GroundedImg({ ground, alt, className, onLoad, ...img }: ComponentProps<'img'> & { alt: string; ground?: PhotoGround }) {
  const [loaded, setLoaded] = useState(false)
  // Catches an image that finished loading before hydration, when onLoad never fires.
  const markIfLoaded = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])
  return (
    <img
      {...img}
      alt={alt}
      ref={markIfLoaded}
      onLoad={(event) => {
        setLoaded(true)
        onLoad?.(event)
      }}
      className={cn(className, ground && loaded && GROUND_CLASS[ground])}
    />
  )
}
