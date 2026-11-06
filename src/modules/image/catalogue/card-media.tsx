'use client'

/* eslint-disable @next/next/no-img-element -- covers are pre-sized WebP on the public assets
   bucket (ARCHITECTURE §8.3, long edge 1600); the image optimizer would only re-encode them. */
import { useRef } from 'react'

import { cn } from '@/core/ui/cn'
import { useMediaQuery } from '@/core/ui/use-media-query'

import type { CatalogueTemplate } from './catalogue-template'
import { SplitTags } from './split-tags'
import { REDUCED_MOTION, useQuietLoop } from './use-motion'

// A motion template with no before / after stills: its loop (or animated WebP) over the split
// poster in one 8:5 frame, playing while in view under the Quiet Loop rule (DESIGN §4.2).
export function LoopPlate({ template, alt, className }: { template: CatalogueTemplate; alt: string; className?: string }) {
  const { type, motion, poster } = template.cover
  return (
    <span className={cn('hairline relative isolate block aspect-[8/5] overflow-hidden rounded-control bg-muted', className)}>
      {type === 'video' ? <LoopVideo src={motion as string} poster={poster as string} label={alt} /> : <AnimatedImage src={motion as string} poster={poster as string} label={alt} />}
    </span>
  )
}

function LoopVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const playing = useQuietLoop(ref, src)
  return (
    <>
      <video ref={ref} poster={poster} muted loop playsInline preload="none" aria-label={label} className="absolute inset-0 size-full object-cover" />
      <SplitTags hidden={playing} />
    </>
  )
}

// Animated WebP; reduced motion shows the still poster instead.
function AnimatedImage({ src, poster, label }: { src: string; poster: string; label: string }) {
  const reduce = useMediaQuery(REDUCED_MOTION)
  return (
    <>
      <img src={reduce ? poster : src} alt={label} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      <SplitTags hidden={!reduce} />
    </>
  )
}
