'use client'

import { useEffect, useRef, type RefObject } from 'react'

// After 「查看全部」 in All (Owner 2026-11-12): once the chosen category's grid has rendered,
// focus that category's chip (the tapped button is gone with the sections) and bring the grid's
// top to just under where the chip bar sticks. `chosen` is the root slug the selection now holds.
export function useSeeAllLanding(chosen: string | undefined, sentinel: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>) {
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current || pending.current !== chosen) return
    pending.current = null
    bar.current?.querySelector<HTMLButtonElement>('[role="group"] button[aria-pressed="true"]')?.focus({ preventScroll: true })
    landUnderBar(sentinel.current, bar.current)
  }, [chosen, sentinel, bar])
  return (slug: string) => {
    pending.current = slug
  }
}

// The 1 px sentinel sits right above the sticky chip bar. Scroll it to just above the line the
// bar sticks at (0 on phones, under the 56 px tab bar from md): the bar then rests at its stuck
// place with the grid starting just below it, nothing tucked under either bar. Two pixels, not
// one: a sentinel whose bottom touches the viewport's top edge still counts as intersecting, and
// on a phone the bar must read as stuck to take its material and the notch's safe-area padding
// (useStuck), which pushes the grid down rather than over it. Nothing moves when the grid's top
// is already in view.
const LAND_ABOVE = 2

export function landUnderBar(sentinel: HTMLElement | null, bar: HTMLElement | null) {
  if (!sentinel || !bar) return
  const stickAt = Number.parseFloat(getComputedStyle(bar).top) || 0
  const top = sentinel.getBoundingClientRect().top
  if (top >= stickAt) return
  window.scrollTo({ top: window.scrollY + top - stickAt + LAND_ABOVE })
}
