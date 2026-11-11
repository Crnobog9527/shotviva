'use client'

import { useEffect, useState } from 'react'

import { useMediaQuery } from '@/core/ui/use-media-query'

import { REDUCED_MOTION } from '../catalogue/use-motion'

// A demo plays once from mount: `starts` are the times (ms) each phase begins, so the phase is
// 0 before the first and starts.length once the last has begun. Replay remounts the scene (a new
// key), which starts it over. Under reduced motion it is the last phase at once, nothing moves.
export function usePlayback(starts: readonly number[], onEnd?: () => void, holdMs = 0): { phase: number; reduce: boolean } {
  const reduce = useMediaQuery(REDUCED_MOTION)
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (reduce) return
    const timers = starts.map((at, index) => window.setTimeout(() => setPhase(index + 1), at))
    if (onEnd) timers.push(window.setTimeout(onEnd, (starts.at(-1) ?? 0) + holdMs))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
    // A scene's timeline is fixed for its life; onEnd is read once, as it was at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])
  return { phase: reduce ? starts.length : phase, reduce }
}

// A number that runs from 0 to `to` over `ms` once `run` turns true (an upload counter, a
// progress count); `to` at once under reduced motion.
export function useCountUp(to: number, ms: number, run: boolean, reduce: boolean, ease: (t: number) => number = easeOut): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run || reduce) return
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const done = Math.min(1, (now - start) / ms)
      setValue(Math.round(to * ease(done)))
      if (done < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, ms, run, reduce, ease])
  return reduce ? to : value
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3
// Progress keeps pace with the results developing one after another.
export const linear = (t: number) => t
