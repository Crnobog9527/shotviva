'use client'

import { useRef, useState, type TouchEvent } from 'react'

import { DRAG_TO_CLOSE, pulledDown } from './lightbox-state'

// Dragging the lightbox sheet down with a finger: it follows the finger, and letting go past
// DRAG_TO_CLOSE closes it; otherwise it springs back. A sideways or upward drag is left alone.
export function useSwipeDown(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const [pulled, setPulled] = useState(0)
  const handlers = {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0]
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    },
    onTouchMove(event: TouchEvent) {
      const [from, touch] = [start.current, event.touches[0]]
      if (from && touch) setPulled(pulledDown(touch.clientX - from.x, touch.clientY - from.y))
    },
    onTouchEnd() {
      start.current = null
      if (pulled > DRAG_TO_CLOSE) onClose()
      else setPulled(0)
    },
  }
  return { pulled, handlers: { ...handlers, onTouchCancel: handlers.onTouchEnd } }
}
