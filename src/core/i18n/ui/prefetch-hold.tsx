'use client'

import { useLayoutEffect, useSyncExternalStore } from 'react'

import { HOLD_MAX_MS } from './prefetch-hold-boot'

// Links wait to prefetch while a page is still fetching the data it needs to answer taps. Create
// (2026-11-28): the page is drawn from the phone at once, and until the account's own data lands
// nothing on it responds. In that window the tab bar and the page's links started 10–15 route
// prefetches (110–180 KB) next to that one request; without them the page answered 0.5–0.8 s
// sooner on a 300 ms / 1 Mbps link. A held link still navigates on the click, just not ahead of it.

declare global {
  interface Window { __svHoldPrefetch?: boolean }
}

// Set by the page's HTML before the layout's links hydrate (prefetch-hold-boot.ts).
const bootHeld = () => typeof window !== 'undefined' && window.__svHoldPrefetch === true

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

// The store answers false on the server and while hydrating; the flag covers that first render in
// the browser (prefetch is not an attribute, so the two renders' HTML is the same).
export function useLinkPrefetchHeld(): boolean {
  const held = useSyncExternalStore(subscribe, linkPrefetchHeld, () => false)
  return held || bootHeld()
}

// Rendered by a page beside the data it streams: holds every Link's prefetch until `until` settles
// (either way), this leaves the page, or HOLD_MAX_MS passes, whichever is first. The page's server
// part renders BOOT_HOLD_SCRIPT beside it.
export function HoldLinkPrefetch({ until }: { until: Promise<unknown> }) {
  useLayoutEffect(() => {
    const release = holdLinkPrefetch()
    window.__svHoldPrefetch = false
    const timer = setTimeout(release, HOLD_MAX_MS)
    until.then(release, release)
    return () => {
      clearTimeout(timer)
      release()
    }
  }, [until])
  return null
}
