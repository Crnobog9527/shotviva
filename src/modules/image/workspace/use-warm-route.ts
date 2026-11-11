'use client'

import { useEffect } from 'react'

import { useRouter } from '@/core/i18n'

// How often an open dialog asks the router for the route again.
const REWARM_MS = 20_000

// Keeps a route prefetched for as long as `active` is true: the creation dialogs use it for the
// workspace page Generate moves to, so the move, and the developing view that page's shell draws
// from this tab's own job (workspace-pending.tsx), happen on the click instead of after a round
// trip. The router's copy goes stale after five minutes and a stale copy is as good as none
// (measured on the test site: a click 5.5 minutes in waited 1.1–4.1 s again), so the route is
// asked for again every REWARM_MS: a fresh copy answers from the cache without a request, a
// stale one is fetched. onInvalidate covers the router dropping it early.
export function useWarmRoute(href: string, active: boolean): void {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    let stopped = false
    const warm = () => {
      if (!stopped) router.prefetch(href, { onInvalidate: warm })
    }
    warm()
    const again = setInterval(() => router.prefetch(href), REWARM_MS)
    return () => {
      stopped = true
      clearInterval(again)
    }
  }, [active, href, router])
}
