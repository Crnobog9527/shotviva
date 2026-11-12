'use client'

import { useRef, type PointerEvent } from 'react'

// A horizontal swipe on the photo steps to the previous or next work (phones). Only a touch
// that travels mostly sideways counts; the element takes touch-action: pan-y so the browser
// keeps vertical scrolling and leaves the sideways move to us.
const MIN_PX = 48

export function useSwipe(onStep: (delta: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const delta = swipeDelta(event.clientX - from.x, event.clientY - from.y)
      if (delta) onStep(delta)
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}

// Swiping left (finger to the left) shows the next work.
export function swipeDelta(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dx) < MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null
  return dx < 0 ? 1 : -1
}
