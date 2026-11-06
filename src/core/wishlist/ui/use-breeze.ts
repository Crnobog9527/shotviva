'use client'

import { useEffect, useRef, type PointerEvent } from 'react'

// Clamp for the scroll sway, in degrees (B comp wishlist.html).
const MAX_SWAY = 6
const SETTLE_MS = 120

// Scroll speed → a sway angle for the wall, clamped; pure so it is unit-tested.
export function swayFromScroll(deltaY: number, elapsedMs: number): number {
  const v = (deltaY / Math.max(16, elapsedMs)) * 4
  return Math.max(-MAX_SWAY, Math.min(MAX_SWAY, v))
}

// The breeze on the wall (B comp wishlist.html): scrolling sways every note by its scroll speed
// and the sway settles when scrolling stops; the pointer crossing a note sets off one gust.
// Decoration only. Under "reduce motion" the CSS pins every note and drops the gust.
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
  const gust = (event: PointerEvent<HTMLLIElement>) => {
    if (event.pointerType !== 'mouse') return
    const note = event.currentTarget
    note.classList.remove('wl-blow')
    void note.offsetWidth
    note.classList.add('wl-blow')
  }
  const settled = (event: { currentTarget: HTMLLIElement }) => event.currentTarget.classList.remove('wl-blow')
  return { wall, gust, settled }
}
