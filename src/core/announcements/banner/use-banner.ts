'use client'

import { useSyncExternalStore } from 'react'

// Not the rules index: it also exports the zod schemas, which the banner must not ship.
import { CLOSED_STORAGE_KEY, isClosed, parseClosed, recordClose } from '../rules/dismissal'
import { pickLive } from '../rules/rules'
import type { BannerAnnouncement } from '../rules/types'

const MINUTE = 60_000

// The clock in whole minutes: a stable snapshot that changes once a minute, which is as fine
// as a start, end or reshow time needs. null on the server and during hydration.
function subscribeMinute(notify: () => void) {
  const timer = setInterval(notify, MINUTE)
  return () => clearInterval(timer)
}
const currentMinute = () => Math.floor(Date.now() / MINUTE)

// The closed list in localStorage (rules/dismissal.ts), as its raw string so the snapshot is
// stable. The storage event only reaches other tabs, so this tab's own write notifies through
// the listener set.
const listeners = new Set<() => void>()
let memoryClosed: string | null = null
function subscribeClosed(notify: () => void) {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}
function readClosed(): string | null {
  try {
    return window.localStorage.getItem(CLOSED_STORAGE_KEY)
  } catch {
    return null
  }
}
function close(key: string, reshowAfterDays: number | null) {
  const next = recordClose(readClosed() ?? memoryClosed, key, reshowAfterDays, Date.now())
  try {
    window.localStorage.setItem(CLOSED_STORAGE_KEY, next)
  } catch {
    // Private mode: nothing to keep; the in-memory fallback below still hides it.
  }
  memoryClosed = next
  listeners.forEach((notify) => notify())
}
const closedSnapshot = () => readClosed() ?? memoryClosed
const serverNull = () => null

// Starts from the server's pick (same HTML on both sides; a closed one is already hidden by the
// early <style>), then follows the real clock and the closed list.
export function useBanner(items: readonly BannerAnnouncement[], initialId: string | null) {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverNull)
  const closed = useSyncExternalStore(subscribeClosed, closedSnapshot, serverNull)
  if (minute === null) return { current: items.find((item) => item.id === initialId) ?? null, dismiss: close }
  const now = minute * MINUTE
  const live = pickLive(items, now)
  const hidden = live?.closeKey ? isClosed(parseClosed(closed), live.closeKey, now) : false
  return { current: hidden ? null : live, dismiss: close }
}
