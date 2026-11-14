'use client'

import { useEffect, useState } from 'react'

// Re-renders every `ms` so elapsed-time progress moves while a photo develops.
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}
