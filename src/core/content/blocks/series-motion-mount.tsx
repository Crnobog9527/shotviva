'use client'

import { useEffect } from 'react'

import { cycler, HOVER_DELAY_MS, HOVER_HOLD_MS, VIEW_HOLD_MS, type Cycler } from './series-motion'

// Wires every series card on the page once (one effect, no per-card React state): with a fine
// pointer a card plays while the pointer rests on it or it has keyboard focus; on a touch screen
// it plays on its own while most of it is in view. Static under prefers-reduced-motion, and
// before hydration (the server draws the first pair).
function wire(frame: HTMLElement, touch: boolean, observer: IntersectionObserver | null, cards: Map<Element, Cycler>) {
  const card = frame.closest('.mk-series') ?? frame
  const run = cycler(frame)
  cards.set(frame, run)
  if (touch) {
    observer?.observe(frame)
    return () => undefined
  }
  const start = () => run.start(HOVER_DELAY_MS, HOVER_HOLD_MS)
  const stop = () => run.stop()
  card.addEventListener('pointerenter', start)
  card.addEventListener('pointerleave', stop)
  card.addEventListener('focusin', start)
  card.addEventListener('focusout', stop)
  return () => {
    card.removeEventListener('pointerenter', start)
    card.removeEventListener('pointerleave', stop)
    card.removeEventListener('focusin', start)
    card.removeEventListener('focusout', stop)
  }
}

export function SeriesMotion() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const frames = [...document.querySelectorAll<HTMLElement>('[data-series-pairs]')]
    if (!frames.length) return
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches
    const cards = new Map<Element, Cycler>()
    const observer = touch
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const run = cards.get(entry.target)
              if (entry.isIntersecting) run?.start(VIEW_HOLD_MS / 2, VIEW_HOLD_MS)
              else run?.stop()
            }
          },
          { threshold: 0.6 },
        )
      : null
    const unwire = frames.map((frame) => wire(frame, touch, observer, cards))
    return () => {
      observer?.disconnect()
      for (const off of unwire) off()
      for (const run of cards.values()) run.stop()
    }
  }, [])
  return null
}
