'use client'

import { useLayoutEffect, useSyncExternalStore } from 'react'

// Links wait to prefetch while a page is still fetching the data it needs to answer taps. Create
// (2026-11-28): the page is drawn from the phone at once, and until the account's own data lands
// nothing on it responds. In that window the tab bar and the page's links started 10–15 route
// prefetches (110–180 KB) next to that one request; without them the page answered 0.5–0.8 s
// sooner on a 300 ms / 1 Mbps link. A held link still navigates on the click, just not ahead of it.
const HOLD_MAX_MS = 10_000

let holds = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

// Takes one hold; the returned function gives it back (once).
export function holdLinkPrefetch(): () => void {
  holds += 1
  emit()
  let held = true
  return () => {
    if (!held) return
    held = false
    holds -= 1
    emit()
  }
}

export const linkPrefetchHeld = () => holds > 0

// False on the server and while hydrating: a hold is taken in the browser only.
export function useLinkPrefetchHeld(): boolean {
  return useSyncExternalStore(subscribe, linkPrefetchHeld, () => false)
}

// Rendered by a page beside the data it streams: holds every Link's prefetch until `until` settles
// (either way), this leaves the page, or HOLD_MAX_MS passes, whichever is first. A layout effect,
// so the hold is taken in the commit that mounts the links, before their visibility observers
// report and a prefetch is scheduled.
export function HoldLinkPrefetch({ until }: { until: Promise<unknown> }) {
  useLayoutEffect(() => {
    const release = holdLinkPrefetch()
    const timer = setTimeout(release, HOLD_MAX_MS)
    until.then(release, release)
    return () => {
      clearTimeout(timer)
      release()
    }
  }, [until])
  return null
}
