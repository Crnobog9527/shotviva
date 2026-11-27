'use client'

/* eslint-disable @next/next/no-img-element -- auth-gated download route or a cover on the public assets bucket */
import type { ComponentProps } from 'react'
import { useCallback } from 'react'

import { cn } from '@/core/ui/cn'
import { setImageRatio } from '@/core/ui/image-ratio'
import { useLoaded } from '@/core/ui/use-loaded'

export type PhotoGround = 'white' | 'checker'

const GROUND_CLASS: Record<PhotoGround, string> = { white: 'bg-photo-white', checker: 'checker-ground' }

// The class painted behind the pixels: none until the image has loaded, none without a ground.
export const groundClass = (ground: PhotoGround | undefined, loaded: boolean) => (ground && loaded ? GROUND_CLASS[ground] : undefined)

// A result photo or a template's "after" cover with a ground painted behind its own pixels, so a
// transparent PNG reads as a cut-out on white (or on a checkerboard) instead of on the dark UI or
// on whatever sits under it. The ground appears only once the image has loaded (useLoaded).
// Opaque photos cover it fully.
export function GroundedImg({ ground, alt, className, onLoad, fitPlate = false, ...img }: ComponentProps<'img'> & { alt: string; ground?: PhotoGround; fitPlate?: boolean }) {
  const { loaded, ref, onLoad: markLoaded } = useLoaded()
  const attach = useCallback((image: HTMLImageElement | null) => {
    ref(image)
    if (fitPlate && image?.complete) setImageRatio(image)
  }, [ref, fitPlate])
  return (
    <img
      {...img}
      alt={alt}
      ref={attach}
      onLoad={(event) => {
        if (fitPlate) setImageRatio(event.currentTarget)
        markLoaded()
        onLoad?.(event)
      }}
      className={cn(className, groundClass(ground, loaded))}
    />
  )
}
