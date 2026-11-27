'use client'

/* eslint-disable @next/next/no-img-element -- an animated WebP (the optimiser passes animations
   through as stored) and its poster, which goes through coverImage */
import { useRef } from 'react'

import { cn } from '@/core/ui/cn'
import { coverAvif, coverImage, coverSrc } from '@/core/ui/cover-image'
import { Picture } from '@/core/ui/picture'
import { useMediaQuery } from '@/core/ui/use-media-query'

import type { CatalogueTemplate } from './catalogue-template'
import { useNearViewport } from './near-viewport'
import { SplitTags } from './split-tags'
import { REDUCED_MOTION, useQuietLoop } from './use-motion'

// A motion template with no before / after stills: its loop (or animated WebP) over the split
// poster in one 8:5 frame, playing while in view under the Quiet Loop rule (DESIGN §4.2).
// `sizes` is the frame's rendered width, for the poster; a video's poster attribute takes one URL,
// `posterWidth` px wide (1080 covers a card, the dialog and the stage at 2x).
type Props = { template: Pick<CatalogueTemplate, 'cover'>; alt: string; sizes: string; posterWidth?: number; className?: string }

export function LoopPlate({ template, alt, sizes, posterWidth = 1080, className }: Props) {
  const { type, motion, poster } = template.cover
  return (
    <span className={cn('hairline relative isolate block aspect-[8/5] overflow-hidden rounded-control bg-muted', className)}>
      {type === 'video' ? <LoopVideo src={motion as string} poster={coverSrc(poster as string, posterWidth)} label={alt} /> : <AnimatedImage src={motion as string} poster={poster as string} label={alt} sizes={sizes} />}
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

// Animated WebP, under the Quiet Loop rule like the videos: the still poster until the card is half in
// view, then the animation (a whole animated file is far heavier than its poster). Reduced motion
// keeps the poster.
function AnimatedImage({ src, poster, label, sizes }: { src: string; poster: string; label: string; sizes: string }) {
  const reduce = useMediaQuery(REDUCED_MOTION)
  const [ref, inView] = useNearViewport<HTMLSpanElement>(false, '0px', 0.5)
  const still = reduce || !inView
  return (
    <span ref={ref} className="absolute inset-0">
      <Picture avif={still ? coverAvif(poster, sizes) : undefined}>
        <img {...(still ? coverImage(poster, sizes) : { src })} alt={label} loading="lazy" decoding="async" fetchPriority="low" className="absolute inset-0 size-full object-cover" />
      </Picture>
      <SplitTags hidden={!still} />
    </span>
  )
}
