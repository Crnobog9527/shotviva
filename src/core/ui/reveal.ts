'use client'

import { useCallback } from 'react'

// One-shot entry fade for app pages (DESIGN §5 「签收稿的应用页动效补齐」, DESKTOP-NOTES item 6):
// an element tagged with the ref fades up once (480ms, globals.css [data-reveal]) the first time
// it scrolls into the viewport. Elements entering together stagger 40ms apart, at most 8 steps.
// One shared observer serves the whole page. What is already on screen when it is tagged shows at
// once: hiding it would delay the page's largest paint (LCP) and flash server-rendered markup.
// Under reduced motion everything shows at once.

export const REVEAL_STEP_MS = 40
export const REVEAL_MAX_STEPS = 8

// The delay of each element in a batch that entered together, in document order.
export function revealDelays(count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.min(index, REVEAL_MAX_STEPS - 1) * REVEAL_STEP_MS)
}

const inDocumentOrder = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)

let shared: IntersectionObserver | null = null

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

// Shown at once: under reduced motion, without IntersectionObserver, and when already on screen.
function showsAtOnce(element: HTMLElement): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return true
  return inView(element)
}

// The ref for an element that should reveal. It sets data-reveal itself, so markup rendered on
// the server is never hidden before this runs.
export function useReveal<T extends HTMLElement>() {
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
