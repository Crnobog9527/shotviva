'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// How long each AI scene stays up (Owner 2026-11-11: 2 s). The crossfade in marketing.css is
// 0.4 s, so every scene is fully visible for most of its turn.
export const SCENE_MS = 2000

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Runs `then` once the page has loaded and the main thread is idle, so the later scenes never
// compete with the hero's first paint (Lighthouse mobile ≥ 0.85, slow links to mainland China).
// The wait is short (Owner 2026-11-25: a dot click lagged): the first pair is long painted by
// `load`, and the sooner the later pairs are fetched, the likelier a click finds them ready.
function afterLoadAndIdle(then: () => void): () => void {
  let idle = 0
  let timer = 0
  const schedule = () => {
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(then, { timeout: 800 })
    else timer = window.setTimeout(then, 300)
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
  return () => {
    window.removeEventListener('load', schedule)
    if (idle) window.cancelIdleCallback(idle)
    window.clearTimeout(timer)
  }
}

// The hero's rotating scenes. Only the first scene is in the server HTML; the others are
// rendered (`armed`, so fetched and decoded) right after load + idle, also under
// prefers-reduced-motion, where the timer never starts. The timer only moves to a scene whose
// `parts` images (1, or 2 when the phone photo turns too) are loaded and decoded, so a slow link
// never fades to an empty plate. A pick switches at once: if that scene is not ready yet,
// `waiting` hides every other picture (hero-scenes.tsx, marketing.css .mk-wait) so its two
// plates fill in together and never sit next to another scene's. If one of its pictures fails
// to load, the hero goes back to the scene shown before the pick, and that scene is never picked
// or shown again. Hover or focus inside the hero holds the timer; a manual pick stops it for
// good (WCAG 2.2.2).
export function useSceneRotation(count: number, parts = 1) {
  const [{ active, previous }, setShown] = useState({ active: 0, previous: -1 })
  const [armed, setArmed] = useState(false)
  const [auto, setAuto] = useState(true)
  const [held, setHeld] = useState(false)
  const [waiting, setWaiting] = useState(-1)
  const loaded = useRef<number[]>([parts])
  // The scene a pending pick came from, and the scenes whose pictures failed.
  const from = useRef(0)
  const waitingFor = useRef(-1)
  const failed = useRef(new Set<number>())

  useEffect(() => afterLoadAndIdle(() => setArmed(true)), [])

  useEffect(() => {
    if (!auto || held || !armed || reducedMotion()) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      setShown((shown) => {
        const next = (shown.active + 1) % count
        return (loaded.current[next] ?? 0) >= parts ? { active: next, previous: shown.active } : shown
      })
    }, SCENE_MS)
    return () => window.clearInterval(id)
  }, [auto, held, armed, count, parts])

  const pick = useCallback(
    (index: number) => {
      if (failed.current.has(index)) return
      setAuto(false)
      setArmed(true)
      const now = (loaded.current[index] ?? 0) >= parts
      waitingFor.current = now ? -1 : index
      setWaiting(waitingFor.current)
      setShown((shown) => {
        if (shown.active === index) return shown
        if (waitingFor.current === -1 || shown.active !== waitingFor.current) from.current = shown.active
        return { active: index, previous: now ? shown.active : -1 }
      })
    },
    [parts],
  )
  const markLoaded = useCallback(
    (index: number) => {
      loaded.current[index] = (loaded.current[index] ?? 0) + 1
      if ((loaded.current[index] ?? 0) >= parts && waitingFor.current === index) {
        waitingFor.current = -1
        setWaiting(-1)
      }
    },
    [parts],
  )
  const markFailed = useCallback((index: number) => {
    failed.current.add(index)
    if (waitingFor.current !== index) return
    waitingFor.current = -1
    setWaiting(-1)
    setShown({ active: from.current, previous: -1 })
  }, [])

  return { active, previous, armed, waiting, pick, markLoaded, markFailed, hold: setHeld }
}
