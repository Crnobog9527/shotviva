'use client'

import { useEffect, useState } from 'react'

import { useSessionHint } from '../../auth/session-hint'
import type { MemberStanding } from '../subscription/standing'
import { StandingFeed } from './standing-context'

// StandingSlot's counterpart for a static public page (/pricing): the member's standing is asked
// for from the browser, and only when a session cookie is there, so the page itself needs no
// request-time read and a signed-out visitor never calls a function. Placed inside a
// PaywallProvider. A failed or refused read leaves every plan open, as StandingSlot does;
// checkout still refuses on the server (409).
export function StandingFetch() {
  const signedIn = useSessionHint()
  const [standing, setStanding] = useState<MemberStanding | null>(null)
  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    fetch('/api/account/standing', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ standing?: MemberStanding }>) : null))
      .then((body) => body?.standing && setStanding(body.standing))
      .catch(() => undefined)
    return () => controller.abort()
  }, [signedIn])
  return standing ? <StandingFeed standing={standing} /> : null
}
