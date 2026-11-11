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
// stale one is fetched. A tab in the background asks for nothing and catches up the moment it
// is shown again. onInvalidate covers the router dropping its copy early.
export function useWarmRoute(href: string, active: boolean): void {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    let stopped = false
    const warm = () => {
      if (!stopped) router.prefetch(href, { onInvalidate: warm })
    }
    const whileShown = () => {
      if (document.visibilityState === 'visible') router.prefetch(href)
    }
    warm()
    const again = setInterval(whileShown, REWARM_MS)
    document.addEventListener('visibilitychange', whileShown)
    return () => {
      stopped = true
      clearInterval(again)
      document.removeEventListener('visibilitychange', whileShown)
    }
  }, [active, href, router])
}
