'use client'

import { useEffect, useState } from 'react'

// Past this a wait is no longer normal (a sign-in from mainland China that is going to work
// usually has its answer by then), and the form says the network is slow.
export const SLOW_AFTER_MS = 6000

// true once `busy` has lasted SLOW_AFTER_MS; false again as soon as it ends.
export function useSlow(busy: boolean): boolean {
  const [slowSince, setSlowSince] = useState<boolean>(false)
  useEffect(() => {
    if (!busy) return
    const timer = setTimeout(() => setSlowSince(true), SLOW_AFTER_MS)
    return () => {
      clearTimeout(timer)
      setSlowSince(false)
    }
  }, [busy])
  return busy && slowSince
}
