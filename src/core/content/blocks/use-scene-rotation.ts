'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// How long each AI scene stays up (Owner 2026-11-11: 2 s). The crossfade in marketing.css is
// 0.4 s, so every scene is fully visible for most of its turn.
export const SCENE_MS = 2000

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Runs `then` once the page has loaded and the main thread is idle, so the later scenes never
// compete with the hero's first paint (Lighthouse mobile ≥ 0.85, slow links to mainland China).
function afterLoadAndIdle(then: () => void): () => void {
  let idle = 0
  let timer = 0
  const schedule = () => {
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(then, { timeout: 3000 })
    else timer = window.setTimeout(then, 1500)
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
  return () => {
    window.removeEventListener('load', schedule)
    if (idle) window.cancelIdleCallback(idle)
    window.clearTimeout(timer)
  }
}

// The hero's rotating AI scenes. Only the first scene is in the server HTML; the others are
// rendered (`armed`) after load + idle, or at once when someone picks one. The timer only moves
// to a scene whose `parts` images (1, or 2 when the phone photo turns too) have all loaded, so a
// slow link never fades to an empty plate. Hover or
// focus inside the hero holds it; a manual pick stops it for good (WCAG 2.2.2), and under
// prefers-reduced-motion it never starts.
export function useSceneRotation(count: number, parts = 1) {
  const [{ active, previous }, setShown] = useState({ active: 0, previous: -1 })
  const [armed, setArmed] = useState(false)
  const [auto, setAuto] = useState(true)
  const [held, setHeld] = useState(false)
  const loaded = useRef<number[]>([parts])

  useEffect(() => (reducedMotion() ? undefined : afterLoadAndIdle(() => setArmed(true))), [])

  useEffect(() => {
    if (!auto || held || !armed) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      setShown((shown) => {
        const next = (shown.active + 1) % count
        return (loaded.current[next] ?? 0) >= parts ? { active: next, previous: shown.active } : shown
      })
    }, SCENE_MS)
    return () => window.clearInterval(id)
  }, [auto, held, armed, count, parts])

  // A pick waits for its scene's pictures too (the later ones may not exist yet: picking is
  // what arms them under reduced motion), so the two plates never show different dishes.
  const wanted = useRef(-1)
  const show = useCallback((index: number) => {
    wanted.current = -1
    setShown((shown) => (shown.active === index ? shown : { active: index, previous: shown.active }))
  }, [])
  const pick = useCallback(
    (index: number) => {
      setAuto(false)
      setArmed(true)
      if ((loaded.current[index] ?? 0) >= parts) show(index)
      else wanted.current = index
    },
    [parts, show],
  )
  const markLoaded = useCallback(
    (index: number) => {
      loaded.current[index] = (loaded.current[index] ?? 0) + 1
      if (wanted.current === index && loaded.current[index] >= parts) show(index)
    },
    [parts, show],
  )

  return { active, previous, armed, pick, markLoaded, hold: setHeld }
}
