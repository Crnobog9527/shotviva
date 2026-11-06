'use client'

import { useCallback, useEffect, useState } from 'react'

// "Send the email again" waits this long after each send (design/comps-v3-b/auth.html `?resent=1`).
export const RESEND_COOLDOWN_SECONDS = 60

export function useCooldown(seconds: number = RESEND_COOLDOWN_SECONDS) {
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])

  const start = useCallback(() => setLeft(seconds), [seconds])
  return { left, start }
}
