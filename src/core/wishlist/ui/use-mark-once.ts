'use client'

import { useEffect, useRef } from 'react'

// Tells the server a first-run hint has been seen, once per mount, the first time `active` is
// true. A failed call only means the hint shows once more on another visit, so it is ignored.
export function useMarkOnce(active: boolean, mark: () => Promise<void>): void {
  const sent = useRef(false)
  useEffect(() => {
    if (!active || sent.current) return
    sent.current = true
    mark().catch(() => {})
  }, [active, mark])
}
