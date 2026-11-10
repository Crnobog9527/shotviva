'use client'

import { useCallback, useRef, useState, type UIEvent } from 'react'

// A swipeable row of steps (scroll-snap): which one is in view, and a way to bring one in from
// the dots. Native scrolling does the swipe, so touch, trackpad and keyboard all work.
export function useStepRail(count: number) {
  const rail = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const { scrollLeft, clientWidth } = event.currentTarget
      if (clientWidth > 0) setIndex(Math.min(count - 1, Math.max(0, Math.round(scrollLeft / clientWidth))))
    },
    [count],
  )
  const goTo = useCallback((next: number) => {
    const element = rail.current
    if (!element) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({ left: next * element.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
  }, [])
  return { rail, index, onScroll, goTo }
}
