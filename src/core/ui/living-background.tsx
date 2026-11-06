'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { markHydrated } from './reveal'
import './living-background.css'

const REDUCED = '(prefers-reduced-motion: reduce)'
const POINTER = '(hover: hover) and (pointer: fine)'

// The site's living background, Bold preset (DESIGN §5 「全站流动背景」, T54): grain, two drifting
// safelight pools that follow the scroll, a pool that follows the pointer, and a breathing
// vignette, on one fixed plane under all content (living-background.css). Mounted by the
// marketing and app layouts; on admin pages it is hidden (living-background.css). It waits two frames after hydration so it can't
// hold up the first paint, never mounts under reduced motion (the static ground and grain stay),
// has no pointer layer on touch screens, and pauses while the tab is hidden.
export function LivingBackground() {
  const [mount, setMount] = useState<{ pointer: boolean } | null>(null)
  useEffect(() => {
    markHydrated()
    if (window.matchMedia(REDUCED).matches) return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setMount({ pointer: window.matchMedia(POINTER).matches }))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  if (!mount) return null
  return createPortal(<Layers pointer={mount.pointer} />, document.body)
}

function Layers({ pointer }: { pointer: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const element = root.current
    if (!element) return
    document.documentElement.dataset.livingBg = ''
    // One frame at opacity 0 first, so the layers fade in over the ground.
    const fade = requestAnimationFrame(() => setOn(true))
    const stops = [followScroll(element), pauseWhenHidden(element), pointer ? followPointer(element) : () => undefined]
    return () => {
      cancelAnimationFrame(fade)
      stops.forEach((stop) => stop())
      delete document.documentElement.dataset.livingBg
    }
  }, [pointer])
  return (
    <div ref={root} className="lbg" aria-hidden="true" data-on={on ? '' : undefined}>
      <div className="lbg-pools">
        <div className="lbg-pool a" />
        <div className="lbg-pool b" />
      </div>
      {pointer ? <div className="lbg-cursor" /> : null}
      <div className="lbg-vig" />
      <div className="lbg-grain" />
    </div>
  )
}

// One passive listener: the pools get the scroll offset, and data-scrolling while it moves.
function followScroll(element: HTMLElement): () => void {
  let settle = 0
  const onScroll = () => {
    element.style.setProperty('--sy', `${window.scrollY}px`)
    element.dataset.scrolling = ''
    window.clearTimeout(settle)
    settle = window.setTimeout(() => delete element.dataset.scrolling, 220)
  }
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => {
    window.removeEventListener('scroll', onScroll)
    window.clearTimeout(settle)
  }
}

// The small pool eases toward the pointer, a beat behind, on one rAF loop that stops once it
// has caught up; the big pools lean toward the pointer by a few percent (--lx / --ly, -1..1).
function followPointer(element: HTMLElement): () => void {
  let target = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
  let at = { ...target }
  let frame = 0
  const step = () => {
    at = { x: at.x + (target.x - at.x) * 0.08, y: at.y + (target.y - at.y) * 0.08 }
    element.style.setProperty('--px', `${at.x}px`)
    element.style.setProperty('--py', `${at.y}px`)
    frame = Math.abs(target.x - at.x) + Math.abs(target.y - at.y) > 0.5 && !document.hidden ? requestAnimationFrame(step) : 0
  }
  const onMove = (event: PointerEvent) => {
    target = { x: event.clientX, y: event.clientY }
    element.style.setProperty('--lx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
    element.style.setProperty('--ly', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
    if (!frame) frame = requestAnimationFrame(step)
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => {
    window.removeEventListener('pointermove', onMove)
    cancelAnimationFrame(frame)
  }
}

// A hidden tab runs nothing: every animation is paused until it is visible again.
function pauseWhenHidden(element: HTMLElement): () => void {
  const sync = () => {
    if (document.hidden) element.dataset.paused = ''
    else delete element.dataset.paused
  }
  sync()
  document.addEventListener('visibilitychange', sync)
  return () => document.removeEventListener('visibilitychange', sync)
}
