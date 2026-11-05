'use client'

/* eslint-disable @next/next/no-img-element -- covers are pre-sized WebP on the public assets
   bucket (ARCHITECTURE §8.3, long edge 1600); the image optimizer would only re-encode them. */
import { useTranslations } from 'next-intl'
import { useRef } from 'react'

import { useMediaQuery } from '@/core/ui/use-media-query'

import { isMotion, type CatalogueTemplate } from './catalogue-template'
import { MotionBadge, Seam, SplitTags } from './split-tags'
import { REDUCED_MOTION, useQuietLoop } from './use-motion'

// A template card's 4:5 media well: the still split at rest, or the motion file over its
// split poster. No toggle, no hover (DESIGN §4.2).
export function CardMedia({ template, eager = false }: { template: CatalogueTemplate; eager?: boolean }) {
  const alt = useTranslations('app.template')('cardAlt', { name: template.name })
  return (
    <span className="hairline relative isolate block aspect-[4/5] overflow-hidden rounded-control bg-muted">
      {isMotion(template) ? <MotionMedia template={template} alt={alt} /> : <StillSplit template={template} eager={eager} alt={alt} />}
    </span>
  )
}

function StillSplit({ template, eager, alt }: { template: CatalogueTemplate; eager: boolean; alt: string }) {
  const { before, after } = template.cover
  if (!before || !after) return null
  const loading = eager ? 'eager' : 'lazy'
  return (
    <>
      <img src={before} alt="" loading={loading} decoding="async" className="absolute inset-0 size-full object-cover saturate-[.85]" />
      <img src={after} alt={alt} loading={loading} decoding="async" className="absolute inset-0 size-full object-cover [clip-path:inset(0_0_0_50%)]" />
      <Seam />
      <SplitTags />
    </>
  )
}

function MotionMedia({ template, alt }: { template: CatalogueTemplate; alt: string }) {
  const { type, motion, poster } = template.cover
  if (type === 'video') return <LoopVideo src={motion as string} poster={poster as string} label={alt} />
  return <AnimatedImage src={motion as string} poster={poster as string} label={alt} />
}

function LoopVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const playing = useQuietLoop(ref, src)
  return (
    <>
      <video ref={ref} poster={poster} muted loop playsInline preload="none" aria-label={label} className="absolute inset-0 size-full object-cover" />
      <MotionBadge type="video" />
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
      <MotionBadge type="animated" />
      <SplitTags hidden={!reduce} />
    </>
  )
}
