'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

import type { CelebrationLevel } from './levels'
import { hasCelebrated, markCelebrated } from './seen'

// Decides whether to celebrate (T55) and only then loads the code: not under reduced motion
// (the plate's CSS fade is all), not twice for one payment, never during server rendering. The
// engine and the scripts are a separate chunk that no other page pulls in.
const Celebration = dynamic(() => import('./celebration'), { ssr: false })

export function CelebrationLoader({ level, paymentKey }: { level: CelebrationLevel; paymentKey: string | null }) {
  const [go, setGo] = useState(false)
  // Decided once: the payment is marked seen as it starts, so a second effect run (Strict Mode,
  // a re-render) must reuse this answer instead of reading "already seen".
  const decided = useRef<boolean | null>(null)
  useEffect(() => {
    if (decided.current === null) decided.current = shouldCelebrate(paymentKey)
    if (!decided.current) return
    const frame = requestAnimationFrame(() => setGo(true))
    return () => cancelAnimationFrame(frame)
  }, [paymentKey])
  return go ? <Celebration level={level} /> : null
}

function shouldCelebrate(paymentKey: string | null): boolean {
  if (!paymentKey) return false
  const store = storage()
  if (store && hasCelebrated(store, paymentKey)) return false
  // Remembered before playing, so a reload in the middle does not start it again.
  if (store) markCelebrated(store, paymentKey)
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
