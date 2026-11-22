'use client'

/* eslint-disable @next/next/no-img-element -- a poster at the file's own size */
import { useEffect, useRef } from 'react'

import { cn } from '../../../ui/cn'
import { type IntroMedia, MEDIA_SIZE } from './intro-shots'
import { usePrefersReducedMotion } from './use-reduced-motion'

type Props = { media: IntroMedia; label: string; className?: string }

// A silent looping animation in a 16:10 box. Under prefers-reduced-motion it is the poster
// alone: no <video> is rendered, so nothing is fetched or played.
export function LoopVideo(props: Props) {
  return <LoopMedia {...props} reduced={usePrefersReducedMotion()} />
}

// muted and playsinline are what let a phone start it by itself. Closing unmounts it: pause()
// first, so a browser that keeps the element around stops decoding too.
export function LoopMedia({ media, label, className, reduced }: Props & { reduced: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    video.play().catch(() => {}) // blocked autoplay leaves the poster, which is fine
    return () => video.pause()
  }, [reduced])
  const box = cn('block aspect-[16/10] w-full rounded-inner bg-muted object-cover', className)
  if (reduced)
    return <img src={media.poster} alt={label} width={MEDIA_SIZE.width} height={MEDIA_SIZE.height} decoding="async" className={box} />
  return (
    <video ref={ref} autoPlay muted loop playsInline preload="metadata" poster={media.poster} aria-label={label} className={box}>
      <source src={media.webm} type="video/webm" />
      <source src={media.mp4} type="video/mp4" />
    </video>
  )
}
