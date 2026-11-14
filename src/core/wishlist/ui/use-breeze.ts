'use client'

import { useEffect, useRef } from 'react'

// Clamp for the scroll sway, in degrees (B comp wishlist.html).
const MAX_SWAY = 6
const SETTLE_MS = 120

// Scroll speed → a sway angle for the wall, clamped; pure so it is unit-tested.
export function swayFromScroll(deltaY: number, elapsedMs: number): number {
  const v = (deltaY / Math.max(16, elapsedMs)) * 4
  return Math.max(-MAX_SWAY, Math.min(MAX_SWAY, v))
}

// The breeze on the wall (B comp wishlist.html): scrolling sways every note by its scroll speed
// and the sway settles when scrolling stops. Decoration only; under "reduce motion" the CSS
// pins every note. The pointer no longer sets off a gust (Owner 2026-11-11): a note that swung
// as the mouse came onto it moved its vote button out from under the click.
export function useBreeze() {
  const wall = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const element = wall.current
    if (!element) return
    let lastY = window.scrollY
    let lastT = performance.now()
    let settle: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      const now = performance.now()
      const sway = swayFromScroll(window.scrollY - lastY, now - lastT)
      lastY = window.scrollY
      lastT = now
      element.style.setProperty('--wind', `${sway.toFixed(2)}deg`)
      clearTimeout(settle)
      settle = setTimeout(() => element.style.setProperty('--wind', '0deg'), SETTLE_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(settle)
    }
  }, [])
  return wall
}
