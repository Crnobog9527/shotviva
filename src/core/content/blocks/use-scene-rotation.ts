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

// The next scene the timer may show after `active`: the first ready one going round, so a
// scene still loading or failed is skipped instead of stalling the rotation. `active` itself
// when no other is ready.
export function nextReadyScene(active: number, count: number, isReady: (index: number) => boolean): number {
  for (let step = 1; step < count; step++) {
    const index = (active + step) % count
    if (isReady(index)) return index
  }
  return active
}

// What a pick is waiting for, and the last scene that was shown ready (`settled`): where a pick
// whose pictures fail goes back to. Picks can overlap (A, then B and C while both load), so the
// fallback is never the scene a pick came from but the last one actually shown whole.
export type PickTrack = { waiting: number; settled: number }

export function trackPick(track: PickTrack, index: number, ready: boolean): PickTrack {
  return ready ? { waiting: -1, settled: index } : { waiting: index, settled: track.settled }
}

export function trackLoaded(track: PickTrack, index: number, ready: boolean): PickTrack {
  return track.waiting === index && ready ? { waiting: -1, settled: index } : track
}

// A failed scene that a pick is waiting on sends the hero back to `settled`.
export function trackFailed(track: PickTrack, index: number): { track: PickTrack; fallback: number | null } {
  return track.waiting === index ? { track: { waiting: -1, settled: track.settled }, fallback: track.settled } : { track, fallback: null }
}

// The hero's rotating scenes. Only the first scene is in the server HTML; the others are
// rendered (`armed`, so fetched and decoded) right after load + idle, also under
// prefers-reduced-motion, where the timer never starts. The timer moves to the next scene whose
// `parts` images (1, or 2 when the phone photo turns too) are loaded and decoded, skipping any
// still loading or failed, so a slow link never fades to an empty plate. A pick switches at
// once: if that scene is not ready yet, `waiting` hides every other picture (hero-scenes.tsx,
// marketing.css .mk-wait) so its two plates fill in together and never sit next to another
// scene's. If one of its pictures fails, the hero goes back to the last scene shown whole, and
// the failed scene's dot goes (`failed`): it is never picked or shown again. Hover or focus
// inside the hero holds the timer; a manual pick stops it for good (WCAG 2.2.2).
export function useSceneRotation(count: number, parts = 1) {
  const [{ active, previous }, setShown] = useState({ active: 0, previous: -1 })
  const [armed, setArmed] = useState(false)
  const [auto, setAuto] = useState(true)
  const [held, setHeld] = useState(false)
  const [waiting, setWaiting] = useState(-1)
  const [failed, setFailed] = useState<readonly number[]>([])
  const loaded = useRef<number[]>([parts])
  const broken = useRef(new Set<number>())
  const track = useRef<PickTrack>({ waiting: -1, settled: 0 })
  const ready = useCallback((index: number) => (loaded.current[index] ?? 0) >= parts && !broken.current.has(index), [parts])

  useEffect(() => afterLoadAndIdle(() => setArmed(true)), [])

  useEffect(() => {
    if (!auto || held || !armed || reducedMotion()) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      setShown((shown) => {
        const next = nextReadyScene(shown.active, count, ready)
        if (next === shown.active) return shown
        track.current = { ...track.current, settled: next }
        return { active: next, previous: shown.active }
      })
    }, SCENE_MS)
    return () => window.clearInterval(id)
  }, [auto, held, armed, count, ready])

  const pick = useCallback(
    (index: number) => {
      if (broken.current.has(index)) return
      setAuto(false)
      setArmed(true)
      const now = ready(index)
      track.current = trackPick(track.current, index, now)
      setWaiting(track.current.waiting)
      setShown((shown) => (shown.active === index ? shown : { active: index, previous: now ? shown.active : -1 }))
    },
    [ready],
  )
  const markLoaded = useCallback(
    (index: number) => {
      loaded.current[index] = (loaded.current[index] ?? 0) + 1
      const next = trackLoaded(track.current, index, ready(index))
      if (next === track.current) return
      track.current = next
      setWaiting(-1)
    },
    [ready],
  )
  const markFailed = useCallback((index: number) => {
    if (broken.current.has(index)) return
    broken.current.add(index)
    setFailed((was) => [...was, index])
    const { track: next, fallback } = trackFailed(track.current, index)
    track.current = next
    if (fallback === null) return
    setWaiting(-1)
    setShown({ active: fallback, previous: -1 })
  }, [])

  return { active, previous, armed, waiting, failed, pick, markLoaded, markFailed, hold: setHeld }
}
