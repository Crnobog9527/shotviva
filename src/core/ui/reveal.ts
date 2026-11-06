'use client'

import { useCallback, useEffect } from 'react'

// One-shot entry fade for app pages (DESIGN §5 「签收稿的应用页动效补齐」, DESKTOP-NOTES item 6):
// an element tagged with the ref fades up once (480ms, globals.css [data-reveal]) the first time
// it enters the viewport. Elements entering together stagger 40ms apart, at most 8 steps. One
// shared observer serves the whole page. Under reduced motion they are shown at once.

export const REVEAL_STEP_MS = 40
export const REVEAL_MAX_STEPS = 8

// The delay of each element in a batch that entered together, in document order.
export function revealDelays(count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.min(index, REVEAL_MAX_STEPS - 1) * REVEAL_STEP_MS)
}

const inDocumentOrder = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

let shared: IntersectionObserver | null = null
// False while the first page is hydrating: refs run before effects, so an element tagged then was
// already painted by the server render. The layouts' first effect (LivingBackground) flips it, so
// pages reached by client navigation reveal from the start.
let hydrated = false
export function markHydrated() {
  hydrated = true
}

function observer(): IntersectionObserver {
  if (shared) return shared
  const io = new IntersectionObserver(
    (entries) => {
      const entered = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement).sort(inDocumentOrder)
      revealDelays(entered.length).forEach((delay, index) => {
        const element = entered[index] as HTMLElement
        element.style.setProperty('--reveal-delay', `${delay}ms`)
        element.dataset.in = ''
        io.unobserve(element)
      })
    },
    { rootMargin: '0px 0px -8% 0px' },
  )
  shared = io
  return io
}

const inView = (element: HTMLElement) => {
  const box = element.getBoundingClientRect()
  return box.top < window.innerHeight && box.bottom > 0
}

// Shown at once: under reduced motion, without IntersectionObserver, and for server-rendered
// markup already on screen while hydrating (hiding what was just painted would flash).
function showsAtOnce(element: HTMLElement): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return true
  return !hydrated && inView(element)
}

// The ref for an element that should reveal. It sets data-reveal itself, so markup rendered on
// the server is never hidden before this runs.
export function useReveal<T extends HTMLElement>() {
  useEffect(markHydrated, [])
  return useCallback((element: T | null) => {
    if (!element) return
    element.dataset.reveal = ''
    if (showsAtOnce(element)) {
      element.dataset.in = ''
      return
    }
    observer().observe(element)
    return () => observer().unobserve(element)
  }, [])
}
