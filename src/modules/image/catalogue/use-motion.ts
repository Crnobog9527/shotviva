'use client'

import { useEffect, useState, type RefObject } from 'react'

import { useMediaQuery } from '@/core/ui/use-media-query'

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const pageLoaded = () =>
  new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve()
    else window.addEventListener('load', () => resolve(), { once: true })
  })

// The Quiet Loop Rule: a template video is muted, loops, inline, no controls; its file loads
// only after page load and once it is half in view, and it pauses when it leaves. Under
// reduced motion it never loads or plays (the poster stays). Returns whether it is playing.
export function useQuietLoop(ref: RefObject<HTMLVideoElement | null>, src: string): boolean {
  const reduce = useMediaQuery(REDUCED_MOTION)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video || reduce) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('playing', onPlay)
    video.addEventListener('pause', onPause)
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting) return video.pause()
        await pageLoaded()
        if (!video.getAttribute('src')) video.src = src
        video.muted = true
        // Autoplay blocked (low power mode): fall back to the poster.
        video.play().catch(() => setPlaying(false))
      },
      { threshold: 0.5 },
    )
    io.observe(video)
    return () => {
      io.disconnect()
      video.pause()
      video.removeEventListener('playing', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [ref, src, reduce])
  return playing && !reduce
}
